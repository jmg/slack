import type { ReactNode } from "react";

export type Post = {
  slug: string;
  title: string;
  date: string; // ISO
  description: string;
  author: string;
  readingMinutes: number;
  body: ReactNode;
};

/**
 * Marketing/blog posts. Plain data + JSX so they render as static, SEO-friendly
 * server-rendered pages. Newest first.
 */
export const posts: Post[] = [
  {
    slug: "async-first-team-communication",
    title: "Async-first: how to make team chat calmer, not louder",
    date: "2026-07-26",
    description:
      "Chat doesn't have to mean constant interruptions. A few norms turn it from a firehose into a calm, searchable record of how work gets done.",
    author: "The team",
    readingMinutes: 4,
    body: (
      <>
        <p>
          The complaint about team chat is always the same: it never stops. But
          the noise isn&rsquo;t the tool&rsquo;s fault — it&rsquo;s the
          expectation that everything is urgent. Treat chat as{" "}
          <strong>async-first</strong> and it becomes calmer than email.
        </p>
        <h2>Default to &ldquo;reply when you can&rdquo;</h2>
        <p>
          Most messages don&rsquo;t need an answer in the next five minutes. When
          the team agrees that a normal message is a &ldquo;reply when you
          can&rdquo; and only an @mention or DM means &ldquo;this needs
          you,&rdquo; people stop watching the screen and start doing focused
          work.
        </p>
        <h2>Write the context in, not around</h2>
        <p>
          A good async message carries its own context: what, why, and what you
          need back. It saves a dozen follow-up pings and means someone reading it
          hours later — in a different timezone — can act without a meeting.
        </p>
        <h2>Let search be the memory</h2>
        <p>
          The quiet superpower of chat is that it&rsquo;s a searchable record.
          Decisions made in a channel are findable next month; decisions made in a
          meeting evaporate. Put the important stuff where search can reach it.
        </p>
      </>
    ),
  },
  {
    slug: "self-hosting-team-chat-checklist",
    title: "Self-hosting your team chat: a practical checklist",
    date: "2026-07-25",
    description:
      "Owning your team's chat is simpler than it sounds. Here's what you actually need to run it in production — and sleep at night.",
    author: "Engineering",
    readingMinutes: 5,
    body: (
      <>
        <p>
          Running your own team chat used to mean a rack of servers. Today it&rsquo;s
          a container, a database, and a domain. Here&rsquo;s the short list that
          takes you from &ldquo;it works on my laptop&rdquo; to a service your
          team can rely on.
        </p>
        <h2>The essentials</h2>
        <p>
          You need three things: a web process to serve the app, a{" "}
          <strong>Postgres</strong> database for your messages and members, and
          somewhere to put files — either S3-compatible object storage or a
          mounted disk. Point a domain at the web process, terminate TLS, and
          you&rsquo;re serving traffic.
        </p>
        <h2>Backups are the whole game</h2>
        <p>
          Your database <em>is</em> your team&rsquo;s history. Automate daily
          snapshots, keep a few weeks of them, and — this is the part people skip —{" "}
          <strong>test a restore</strong>. A backup you&rsquo;ve never restored is
          a hope, not a backup.
        </p>
        <h2>Health checks and zero-downtime deploys</h2>
        <p>
          Expose a simple health endpoint and have your platform poll it before
          shifting traffic to a new release. Run database migrations in a release
          step that finishes before the new version goes live, and keep them
          forward-only so a rollback never leaves the schema stranded.
        </p>
        <h2>Keep secrets out of the build</h2>
        <p>
          Database URLs and API keys belong in the runtime environment, never baked
          into a container image where they&rsquo;d live forever in its history.
          Construct database clients lazily so a build never needs production
          credentials in the first place.
        </p>
      </>
    ),
  },
  {
    slug: "real-time-without-polling",
    title: "Real-time without the polling: how our chat stays live",
    date: "2026-07-24",
    description:
      "Messages, reactions and typing show up instantly — with no fixed-interval polling. Here's the Server-Sent Events design that makes it feel alive.",
    author: "Engineering",
    readingMinutes: 4,
    body: (
      <>
        <p>
          A chat app lives or dies by how immediate it feels. If a message takes
          three seconds to appear, the conversation stalls. The obvious fix —
          poll the server every couple of seconds — works, but it wastes
          bandwidth, drains laptop batteries, and still adds a visible lag.
        </p>
        <h2>One stream per workspace</h2>
        <p>
          Instead, every open workspace holds a single{" "}
          <strong>Server-Sent Events</strong> connection. The server pushes tiny
          change <em>signals</em> — &ldquo;a message landed in #engineering&rdquo;
          — and the client revalidates exactly the data that changed. No payloads
          fly over the wire on the hot path, so the same event can fan out to a
          hundred tabs cheaply.
        </p>
        <h2>Signals, not payloads</h2>
        <p>
          Why signals? Because what each person sees is different: whether{" "}
          <em>you</em> reacted, what&rsquo;s unread for <em>you</em>, which
          threads <em>you</em> follow. Pushing a rendered message to everyone
          would be wrong for everyone but the sender. A signal says &ldquo;this
          changed&rdquo;; each client re-fetches its own view.
        </p>
        <h2>A self-healing fallback</h2>
        <p>
          Networks drop. If the stream dies, a long background revalidation still
          catches up eventually, then the stream reconnects and instant delivery
          resumes. You get the responsiveness of push with the resilience of
          pull — and nobody sits there hammering the server every two seconds.
        </p>
      </>
    ),
  },
  {
    slug: "channels-threads-dms",
    title: "Channels, threads and DMs: keeping team chat tidy",
    date: "2026-07-20",
    description:
      "A quick field guide to organizing conversations so the important stuff doesn't drown in noise.",
    author: "The team",
    readingMinutes: 3,
    body: (
      <>
        <p>
          The difference between team chat that helps and team chat that
          exhausts is almost never the tool — it&rsquo;s the habits. Three
          building blocks do most of the work.
        </p>
        <h2>Channels for topics, not people</h2>
        <p>
          Name channels after the work: <code>#engineering</code>,{" "}
          <code>#design</code>, <code>#launch-q3</code>. Public by default so
          anyone can catch up; private only when it genuinely needs to be. You
          join what&rsquo;s relevant and skip the rest.
        </p>
        <h2>Threads to protect the main flow</h2>
        <p>
          When a message sparks a side discussion, reply in a thread. The channel
          stays skimmable, and the ten-message tangent about deploy flags lives
          in one collapsible place instead of shoving everything else off screen.
        </p>
        <h2>DMs for the quick and the personal</h2>
        <p>
          Direct messages are for the one-to-one and small-group asides. If a DM
          turns into a decision the team needs, move it to a channel — chat is
          only useful if the right people can find it later. That&rsquo;s what
          search and @mentions are for.
        </p>
      </>
    ),
  },
  {
    slug: "why-open-team-chat",
    title: "Why we built an open team-chat app",
    date: "2026-07-17",
    description:
      "Own your data, run it anywhere, and never get surprised by a pricing page. The case for team chat you can self-host.",
    author: "The team",
    readingMinutes: 3,
    body: (
      <>
        <p>
          Team chat became infrastructure — the place decisions get made and work
          gets coordinated. That makes it strange how little control most teams
          have over it: your history lives on someone else&rsquo;s servers,
          behind someone else&rsquo;s pricing.
        </p>
        <h2>Your data, your box</h2>
        <p>
          This app is built to run on your own infrastructure. A Postgres
          database and a single web process is the whole story. Deploy it, point
          a domain at it, and your messages, files and members are yours.
        </p>
        <h2>Boring, modern foundations</h2>
        <p>
          Under the hood it&rsquo;s Next.js, Postgres via Prisma, and
          Server-Sent Events for the live updates. Nothing exotic — the kind of
          stack you can read, understand and extend in an afternoon, with file
          uploads that work against S3-compatible storage or the local disk.
        </p>
        <h2>Start small, grow later</h2>
        <p>
          Two people or two hundred, the model is the same: workspaces, channels,
          threads, DMs, mentions, search. No seat-based surprises, no feature
          gates hiding the parts you actually need.
        </p>
      </>
    ),
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
