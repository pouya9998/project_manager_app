import { GitlabWebhookController } from './gitlab-webhook.controller';

describe('GitlabWebhookController idempotency', () => {
  const prisma: any = {
    gitLabConfig: {
      findFirst: jest.fn().mockResolvedValue({
        webhookSecret: 'whsec',
        isActive: true,
      }),
    },
    gitLabWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const gitlab: any = {
    findInternalProjectByGitlabId: jest.fn(),
  };
  const sync: any = {
    processWebhookPayload: jest.fn().mockResolvedValue(undefined),
  };

  let controller: GitlabWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new GitlabWebhookController(prisma, gitlab, sync);
  });

  it('ignores duplicate delivery ids', async () => {
    prisma.gitLabWebhookEvent.findUnique.mockResolvedValue({
      id: 1,
      deliveryId: 'del-1',
      processedAt: new Date(),
    });
    const res = await controller.handle(
      { body: { project: { id: 1 } }, ip: '127.0.0.1' } as any,
      'whsec',
      'Push Hook',
      'del-1',
    );
    expect(res).toEqual({ ok: true, duplicate: true });
    expect(sync.processWebhookPayload).not.toHaveBeenCalled();
  });
});
