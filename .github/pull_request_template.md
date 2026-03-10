## Summary

- 

## Validation

- [ ] Local validation steps are listed in the PR description

## Admin UI Review

If this PR changes `Next-Gen Enterprise Portal/frontend/modules/admin/**`, confirm:

- [ ] Admin route pages do not import `message` / `notification` from `antd`; they use `App.useApp()`
- [ ] Admin route pages do not fall back to raw `Button` / `Table` / `Modal` / `Drawer`; they use the admin UI layer wrappers
- [ ] Admin route pages do not introduce page-level `bg-slate*` / `text-slate*` / `border-slate*` / `dark:*` / `rounded-*` / `shadow-*` utility classes
- [ ] Any necessary raw-content or preview styling uses a targeted `eslint-disable` comment with a concrete reason
