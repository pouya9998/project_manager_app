import { ProjectType } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { GitlabService } from './gitlab.service';

describe('GitlabService boundary & sanitization', () => {
  const prisma: any = {
    gitLabConfig: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    taskEngineeringEvent: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  let service: GitlabService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GitlabService(prisma);
  });

  it('sanitizeConfig never returns raw token ciphertext', async () => {
    prisma.gitLabConfig.findFirst.mockResolvedValue({
      id: 1,
      name: 'default',
      baseUrl: 'https://gitlab.example',
      accessToken: '',
      tokenCiphertext: 'iv.tag.ciphertext',
      tokenLast4: 'oken',
      webhookSecret: 'secret',
      isActive: true,
    });
    const cfg = await service.getConfig();
    expect(JSON.stringify(cfg)).not.toContain('iv.tag.ciphertext');
    expect(JSON.stringify(cfg)).not.toContain('secret');
    expect(cfg.accessToken).toContain('oken');
    expect(cfg.hasToken).toBe(true);
  });

  it('rejects NON_SOFTWARE projects', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 5,
      type: ProjectType.NON_SOFTWARE,
      gitlabProjectId: null,
    });
    await expect(service.assertSoftwareProject(5)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows SOFTWARE projects', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 6,
      type: ProjectType.SOFTWARE,
      gitlabProjectId: 99,
    });
    await expect(service.assertSoftwareProject(6)).resolves.toMatchObject({ id: 6 });
  });
});
