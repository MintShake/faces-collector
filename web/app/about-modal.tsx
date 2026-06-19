"use client";

import { useEffect, useId, useState } from "react";

export function AboutModal() {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button className="navAbout" type="button" onClick={() => setOpen(true)}>
        About
      </button>
      {open && (
        <div className="aboutOverlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="aboutModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="modalClose" type="button" aria-label="Close about" onClick={() => setOpen(false)}>
              x
            </button>
            <h2 id={titleId}>About Faces</h2>
            <p>
              Faces logs changes to public online identity data, including public profile images and associated public profile details.
            </p>
            <p>
              Faces does not verify ownership, endorse profiles, grant rights to images, or claim that a profile image belongs to any person.
            </p>
            <p>
              The archive is informational and may be incomplete, delayed, incorrect, or removed during moderation. Use it as a public-history log, not as proof of identity, permission, or authenticity.
            </p>
            <p>
              If something should be reviewed, use the report controls on the image. Reported images are hidden while they wait for admin review.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
