import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
let vite, StudioPage, StudioWorkspace;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    envFile: false,
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, watch: null },
  });
  const mod = await vite.ssrLoadModule("/src/pages/StudioPage.jsx");
  StudioPage = mod.default;
  StudioWorkspace = mod.StudioWorkspace;
});
after(async () => vite?.close());
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (node) =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const button = (renderer, label) =>
  renderer.root.findAllByType("button").find((b) => text(b) === label);
const recordId = "22222222-2222-4222-8222-222222222222";
async function mount(role, run) {
  const permissions = {
    role,
    canEdit: role !== "viewer",
    canPublish: role === "owner",
  };
  const version = {
    id: "33333333-3333-4333-8333-333333333333",
    version: 1,
    revision: 1,
    state: "draft",
    title: "FICTIONAL Cedar",
    location: "Fictional City",
    description: "Private draft description",
    characteristics: { bedrooms: 3 },
    assets: [],
    publishedAt: null,
  };
  const details = {
    data: {
      id: recordId,
      organizationId: "org-one",
      propertyId: null,
      archived: false,
      association: null,
      versions: [version],
      assets: [],
      history: [],
    },
    permissions,
  };
  const calls = [];
  const client = {
    studioRecords: async () => ({
      data: [
        {
          id: recordId,
          title: version.title,
          state: "draft",
          version: 1,
          archived: false,
        },
      ],
      permissions,
    }),
    studioRecord: async () => structuredClone(details),
    studioCandidates: async () => ({ data: [] }),
    studioPublish: async (...args) => {
      calls.push(args);
      version.state = "published";
    },
    studioSave: async (...args) => {
      calls.push(args);
      Object.assign(version, args[2]);
      version.revision++;
    },
    studioCreate: async (...args) => {
      calls.push(args);
      return { id: recordId };
    },
  };
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(StudioWorkspace, { org: "org-one", client }),
    );
    await wait(5);
  });
  await act(async () => {
    button(renderer, "FICTIONAL Cedar").props.onClick();
    await wait(5);
  });
  try {
    await run({ renderer, client, details, calls });
  } finally {
    await act(async () => renderer.unmount());
  }
}
test("Studio requires sign-in and viewer/editor/owner UI reflects backend capabilities", async () => {
  let r;
  await act(async () => {
    r = TestRenderer.create(
      React.createElement(StudioPage, { auth: { session: null } }),
    );
  });
  assert.match(JSON.stringify(r.toJSON()), /Sign in to open Studio/);
  await act(async () => r.unmount());
  for (const role of ["viewer", "editor", "owner"])
    await mount(role, async ({ renderer }) => {
      assert.equal(!!button(renderer, "Save draft"), role !== "viewer");
      assert.equal(!!button(renderer, "Review publication"), role === "owner");
      assert.equal(
        renderer.root.findByProps({ id: "studio-title" }).parent.props.disabled,
        role === "viewer",
      );
    });
});
test("publication requires an explicit confirmation and an unsaved draft cannot be published", async () =>
  mount("owner", async ({ renderer, calls }) => {
    await act(async () =>
      button(renderer, "Review publication").props.onClick(),
    );
    assert.equal(calls.length, 0);
    assert.ok(button(renderer, "Confirm publication"));
    await act(async () => button(renderer, "Cancel").props.onClick());
    await act(async () =>
      renderer.root
        .findByProps({ id: "studio-description" })
        .props.onChange({ target: { value: "Changed draft" } }),
    );
    assert.equal(button(renderer, "Review publication").props.disabled, true);
    await act(async () =>
      renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
    assert.equal(calls[0][2].expectedRevision, 1);
    await act(async () =>
      button(renderer, "Review publication").props.onClick(),
    );
    await act(async () =>
      button(renderer, "Confirm publication").props.onClick(),
    );
    assert.equal(calls[1][2], 2);
  }));
test("preview safely renders draft text; tenant switch aborts requests and clears private content", async () =>
  mount("editor", async ({ renderer, client }) => {
    await act(async () =>
      renderer.root
        .findByProps({ id: "studio-description" })
        .props.onChange({ target: { value: "<script>unsafe()</script>" } }),
    );
    await act(async () =>
      renderer.root
        .findAllByProps({ role: "tab" })
        .find((t) => text(t) === "Preview")
        .props.onClick(),
    );
    assert.match(JSON.stringify(renderer.toJSON()), /<script>unsafe/);
    assert.equal(renderer.root.findAllByType("script").length, 0);
    let signal;
    const next = {
      ...client,
      studioRecords: async (_org, s) => {
        signal = s;
        return {
          data: [],
          permissions: { role: "viewer", canEdit: false, canPublish: false },
        };
      },
    };
    await act(async () =>
      renderer.update(
        React.createElement(StudioWorkspace, {
          key: "other-org",
          org: "other-org",
          client: next,
        }),
      ),
    );
    assert.equal(
      JSON.stringify(renderer.toJSON()).includes("Private draft description"),
      false,
    );
    assert.equal(JSON.stringify(renderer.toJSON()).includes("unsafe()"), false);
    assert.equal(signal.aborted, false);
  }));
