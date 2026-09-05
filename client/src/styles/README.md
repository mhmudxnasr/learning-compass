# Client styles

`../studio.css` is the only application entrypoint. It imports these modules in
their historical cascade order, so the visual output stays stable while each
workspace remains discoverable in a reasonably sized file.

## Placement rules

- Put global tokens, resets, and shared primitives in `00`–`01`.
- Put workspace-specific selectors in the file named for that workspace.
- Put viewport behavior beside the owning component when possible; use `21`
  only for rules shared by several workspaces.
- Add a new numbered module only for a real product boundary. Import it from
  `studio.css` at the point where its cascade should take effect.
- Do not append another global “final override” layer. Move or replace the
  owning rule and verify desktop, mobile, light, dark, and text zoom behavior.

The higher-numbered files contain compatibility and responsive refinements.
`25-feeds.css` owns the Feeds split reader, subscription disclosure, and their
responsive behavior; obsolete feed selectors were removed from the older Library modules.
Reordering imports is a behavior change and requires the full client build and
E2E suite.
