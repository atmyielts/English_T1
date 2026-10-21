async (page) => {
  const base = new URL(page.url()).origin,
    info = await (await page.request.get(base + "/test/info")).json(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function signin(name) {
    await page.getByLabel("Email", { exact: true }).fill(
      name + "@example.test",
    );
    await page.getByLabel("Password", { exact: true }).fill("synthetic-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  async function owner() {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/assessment/");
    if (
      await page.getByRole("button", { name: "Sign out", exact: true }).count()
    ) await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signin("owner");
    await page.getByRole("heading", { name: "Question banks", exact: true })
      .waitFor();
    await staff();
  }
  async function staff() {
    await page.getByRole("button", { name: "Staff & permissions", exact: true })
      .click();
    await page.getByRole("heading", { name: "Staff invitations", exact: true })
      .waitFor();
    await page.getByRole("button", {
      name: "Create staff invitation",
      exact: true,
    }).waitFor();
  }
  async function create(reason) {
    await page.getByLabel("Recipient email", { exact: true }).fill(
      "invited@example.test",
    );
    await page.getByRole("combobox", {
      name: "Invitation role version",
      exact: true,
    }).selectOption(info.invitationIds.role);
    await page.getByLabel("Invitation expires", { exact: true }).fill(
      new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    );
    await page.getByLabel("Invitation reason", { exact: true }).fill(reason);
    if (
      !await page.getByRole("button", {
        name: "Create staff invitation",
        exact: true,
      }).isDisabled()
    ) throw new Error("Unreviewed invitation enabled");
    await page.getByRole("checkbox", {
      name:
        "I reviewed the recipient, pinned role permissions and both expiry times.",
      exact: true,
    }).check();
    await page.getByRole("button", {
      name: "Create staff invitation",
      exact: true,
    }).click();
  }
  const row = () =>
    page.getByRole("listitem").filter({
      has: page.getByText("invited@example.test", { exact: true }),
    }).filter({
      has: page.getByText("Invited Assessment author · version 1 · pending", {
        exact: true,
      }),
    });
  async function sharedLink() {
    await row().getByRole("button", {
      name: "Get protected share link",
      exact: true,
    }).click();
    const value = await page.getByRole("textbox", {
      name: "Protected invitation link",
      exact: true,
    }).inputValue();
    const url = new URL(value);
    if (url.search || !url.hash.startsWith("#assessment_invite=")) {
      throw new Error("Invitation secret escaped fragment");
    }
    return value;
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await owner();
  await create("Invite an Assessment-only author without changing Academy.");
  await page.getByRole("heading", {
    name: "Saved invitation request needs a receipt",
    exact: true,
  }).waitFor();
  await page.reload();
  await staff();
  await page.getByRole("button", {
    name: "Retry saved invitation request",
    exact: true,
  }).click();
  await page.getByRole("heading", {
    name: "Saved invitation request needs a receipt",
    exact: true,
  }).waitFor({ state: "detached" });
  await row().waitFor();
  const link = await sharedLink();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (
      await page.evaluate(() =>
        document.documentElement.scrollWidth > innerWidth + 1
      )
    ) throw new Error("Invitation management overflow " + width);
    await page.getByRole("heading", { name: "Staff invitations", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "output/playwright/invitations/manage-" + width + ".png",
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(link);
  await page.getByText(
    "Sign in with the verified email address this invitation was sent to. The link must be complete.",
    { exact: true },
  ).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signin("unverified");
  await page.getByText(
    "Verify your Schood email, then sign in with the invitation recipient’s account.",
    { exact: true },
  ).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signin("invited");
  await page.getByRole("heading", {
    name: "Invited Assessment author · version 1",
    exact: true,
  }).waitFor();
  if (
    !await page.getByRole("button", {
      name: "Accept Assessment staff invitation",
      exact: true,
    }).isDisabled()
  ) throw new Error("Unreviewed acceptance enabled");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (
      await page.evaluate(() =>
        document.documentElement.scrollWidth > innerWidth + 1
      )
    ) throw new Error("Recipient invitation overflow " + width);
    await page.screenshot({
      path: "output/playwright/invitations/review-" + width + ".png",
    });
  }
  await page.getByRole("checkbox", {
    name: "I reviewed this institution, role version, permissions and expiry.",
    exact: true,
  }).check();
  await page.getByRole("button", {
    name: "Accept Assessment staff invitation",
    exact: true,
  }).click();
  await page.getByRole("heading", {
    name: "Saved invitation acceptance needs a receipt",
    exact: true,
  }).waitFor();
  await page.reload();
  await page.getByRole("button", {
    name: "Retry saved invitation acceptance",
    exact: true,
  }).click();
  await page.getByRole("heading", { name: "Invitation accepted", exact: true })
    .waitFor();
  await page.getByRole("heading", {
    name: "Saved invitation acceptance needs a receipt",
    exact: true,
  }).waitFor({ state: "detached" });
  await page.getByRole("button", {
    name: "Open assessment workspace",
    exact: true,
  }).click();
  await page.getByRole("heading", { name: "Question banks", exact: true })
    .waitFor();
  if (new URL(page.url()).hash) {
    throw new Error("Completed invitation fragment not cleared");
  }
  if (
    await page.getByRole("button", { name: "Staff & permissions", exact: true })
      .count()
  ) throw new Error("Invitee inherited team management");
  await page.getByLabel("Bank name", { exact: true }).fill(
    "Invitation-created center question bank",
  );
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await page.getByText("Question bank created.", { exact: true }).waitFor();
  await owner();
  await create("Replacement invitation to be explicitly revoked.");
  await row().waitFor();
  const revokedLink = await sharedLink();
  await row().getByRole("button", {
    name: "Review invitation revocation",
    exact: true,
  }).click();
  await page.getByLabel("Invitation revocation reason", { exact: true }).fill(
    "Withdraw this pending invitation only.",
  );
  await page.getByRole("checkbox", {
    name: "I reviewed the pending invitation to revoke.",
    exact: true,
  }).check();
  await page.getByRole("button", {
    name: "Revoke staff invitation",
    exact: true,
  }).click();
  await page.getByText("Invited Assessment author · version 1 · revoked", {
    exact: true,
  }).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto(revokedLink);
  await signin("invited");
  await page.getByText(
    "This invitation has expired or was revoked. Ask the center for a replacement.",
    { exact: true },
  ).waitFor();
  const proof = await (await page.request.get(base + "/test/invitation-proof", {
    headers: { "x-fixture-control": info.control },
  })).json();
  if (errors.length) throw new Error(errors.join("\n"));
  return {
    ...proof,
    connected_invitations: true,
    lost_creation_recovered_after_key_rotation: true,
    lost_acceptance_recovered: true,
    verified_recipient_checks: true,
    revocation_denied: true,
    widths: 5,
    email_sent: false,
  };
}
