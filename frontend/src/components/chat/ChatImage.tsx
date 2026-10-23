import { useState } from 'react';

export default function ChatImage({
  src,
  alt,
  caption,
}: {
  src: string;
  alt?: string;
  caption?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">
        🖼 {alt || 'تصویر'}
      </a>
    );
  }

  return (
    <>
      <button type="button" className="tg-image-btn" onClick={() => setOpen(true)}>
        <img
          src={src}
          alt={alt || ''}
          className="tg-image"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </button>
      {caption ? <div className="mt-1.5 whitespace-pre-wrap break-words px-0.5">{caption}</div> : null}

      {open && (
        <div
          className="tg-lightbox"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button type="button" className="tg-lightbox-close" aria-label="بستن">
            ✕
          </button>
          <img
            src={src}
            alt={alt || ''}
            className="tg-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
