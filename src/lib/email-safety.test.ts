// Unit tests for email-safety.ts: `npm run test:unit` (node:test via tsx).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_NAME_MAX,
  INVITE_EMAIL_LIMITS,
  inviteEmailLimit,
  inviteFooter,
  nameError,
  plainName,
} from "./email-safety";

const none = { workspace: 0, inviter: 0, sameAddress: 0, all: 0 };

test("plainName drops HTML, links and web addresses", () => {
  assert.equal(
    plainName('Your BankID expired: log in at https://lihi2.me/x?y=1 <a href="https://evil">now</a>', "x"),
    "Your BankID expired: log in at now",
  );
  assert.equal(plainName("Statens vegvesen - www.vegvesen-no.com", "x"), "Statens vegvesen -");
  assert.equal(plainName("verify at lihi2.me/abc today", "x"), "verify at today");
  assert.equal(plainName("<img src=x onerror=alert(1)>Ada", "x"), "Ada");
});

test("plainName keeps ordinary names and falls back when nothing is left", () => {
  assert.equal(plainName("Ada Lovelace", "x"), "Ada Lovelace");
  assert.equal(plainName("Acme Inc.", "x"), "Acme Inc.");
  assert.equal(plainName("José O'Brien & Co", "x"), "José O'Brien & Co");
  assert.equal(plainName("https://lihi2.me", "a workspace"), "a workspace");
  assert.equal(plainName(null, "there"), "there");
  assert.equal(plainName("   ", "there"), "there");
});

test("plainName is one short line", () => {
  assert.equal(plainName("Line one\r\nBcc: victim@example.org", "x").includes("\n"), false);
  const long = plainName("A".repeat(200), "x");
  assert.equal(long.length, EMAIL_NAME_MAX);
  assert.ok(long.endsWith("…"));
});

test("nameError refuses HTML and links, allows names with a dot", () => {
  assert.equal(nameError("Ada"), null);
  assert.equal(nameError("Acme.io"), null);
  assert.equal(nameError("Acme Inc."), null);
  assert.equal(nameError("a < b"), null);
  assert.match(nameError("<b>Ada</b>") ?? "", /HTML/);
  assert.match(nameError("Click https://lihi2.me") ?? "", /links/);
  assert.match(nameError("Click http://x.y") ?? "", /links/);
  assert.match(nameError("www.vegvesen.no") ?? "", /links/);
  // Twice in a row: the global regexes must not keep state between calls.
  assert.match(nameError("www.a.no") ?? "", /links/);
  assert.match(nameError("www.a.no") ?? "", /links/);
});

test("inviteEmailLimit lets ordinary use through", () => {
  assert.equal(inviteEmailLimit(none, "free"), null);
  assert.equal(
    inviteEmailLimit(
      { workspace: INVITE_EMAIL_LIMITS.freeWorkspace - 1, inviter: 3, sameAddress: 0, all: 50 },
      "free",
    ),
    null,
  );
});

test("inviteEmailLimit caps a free workspace, a person and every free workspace together", () => {
  assert.match(
    inviteEmailLimit({ ...none, workspace: INVITE_EMAIL_LIMITS.freeWorkspace }, "free") ?? "",
    /This workspace has sent 15/,
  );
  assert.match(
    inviteEmailLimit({ ...none, inviter: INVITE_EMAIL_LIMITS.freeInviter }, "free") ?? "",
    /You've sent 25/,
  );
  assert.match(
    inviteEmailLimit({ ...none, all: INVITE_EMAIL_LIMITS.allFree }, "free") ?? "",
    /can't send more/,
  );
});

test("inviteEmailLimit emails one address once a day per workspace", () => {
  assert.match(inviteEmailLimit({ ...none, sameAddress: 1 }, "free") ?? "", /already emailed/);
  assert.match(inviteEmailLimit({ ...none, sameAddress: 1 }, "team") ?? "", /already emailed/);
});

test("Team workspaces get higher limits and skip the shared free cap", () => {
  const busy = { workspace: 100, inviter: 100, sameAddress: 0, all: 10_000 };
  assert.equal(inviteEmailLimit(busy, "team"), null);
  assert.ok(inviteEmailLimit(busy, "free"));
  assert.ok(inviteEmailLimit({ ...busy, workspace: INVITE_EMAIL_LIMITS.teamWorkspace }, "team"));
  assert.ok(inviteEmailLimit({ ...busy, inviter: INVITE_EMAIL_LIMITS.teamInviter }, "team"));
});

test("inviteFooter names the inviter, escaped, and where to report", () => {
  const f = inviteFooter("Ada <script>", "Talkaroo");
  assert.match(f.text, /Ada <script> entered your address in Talkaroo/);
  assert.match(f.text, /forward it to sales@devcloudsoftware\.com/);
  assert.ok(f.html.includes("Ada &lt;script&gt;"));
  assert.ok(!f.html.includes("<script>"));
});
