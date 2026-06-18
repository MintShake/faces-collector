"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ActivityEvent } from "@/lib/social";

export function ActivityFeed({ initial }: { initial: ActivityEvent[] }) {
  const [events, setEvents] = useState<ActivityEvent[]>(initial);
  const seenIds = useRef(new Set(initial.map((e) => e.id)));

  useEffect(() => {
    const poll = async () => {
      try {
        const data = (await fetch("/api/activity").then((r) => r.json())) as {
          events?: ActivityEvent[];
        };
        if (!data.events) return;
        const fresh = data.events.filter((e) => !seenIds.current.has(e.id));
        if (fresh.length > 0) {
          fresh.forEach((e) => seenIds.current.add(e.id));
          setEvents(data.events);
        }
      } catch { /* ignore */ }
    };

    const timer = setInterval(poll, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (events.length === 0) {
    return (
      <section className="activityFeed">
        <div className="sectionHeading"><h2>Activity</h2></div>
        <p className="activityEmpty">No activity yet — likes and tips will appear here.</p>
      </section>
    );
  }

  return (
    <section className="activityFeed">
      <div className="sectionHeading"><h2>Activity</h2></div>
      <ul className="activityList">
        {events.map((event) => (
          <li key={event.id} className="activityItem">
            <span className="activityIcon">{event.type === "like" ? "♥" : "◆"}</span>
            <div className="activityBody">
              <span className="activityText">
                <ActorName event={event} />
                {event.type === "like" ? " liked " : " tipped "}
                <SubjectName event={event} />
                {event.type === "tip" && event.subject.amount && (
                  <span className="activityAmount"> {event.subject.amount.toLocaleString()} FACES</span>
                )}
              </span>
              <span className="activityTime">{timeAgo(event.at)}</span>
            </div>
            {event.type === "like" && event.subject.imageUrl && (
              <Link href={`/fid/${event.subject.fid}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.subject.imageUrl}
                  alt=""
                  className="activityThumb"
                  loading="lazy"
                  decoding="async"
                />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActorName({ event }: { event: ActivityEvent }) {
  const a = event.actor;
  if (!a) return <span className="activityActor">Someone</span>;
  if (a.fid) {
    const name = a.displayName ?? a.username ?? `FID ${a.fid}`;
    return (
      <Link href={`/fid/${a.fid}`} className="activityActor">
        {name}
      </Link>
    );
  }
  if (a.address) {
    return <span className="activityActor">{a.address.slice(0, 6)}…{a.address.slice(-4)}</span>;
  }
  return <span className="activityActor">Someone</span>;
}

function SubjectName({ event }: { event: ActivityEvent }) {
  const s = event.subject;
  const name = s.displayName ?? s.username ?? `FID ${s.fid}`;
  return (
    <Link href={`/fid/${s.fid}`} className="activitySubject">
      {name}
    </Link>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
