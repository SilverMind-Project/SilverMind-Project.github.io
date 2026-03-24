# Contributing

Thank you for your interest in contributing to Cognitive Companion. This project aims to be a beacon of excellence in the open source community, and contributions of all kinds are welcome.

## Ways to Contribute

### Report Issues

Found a bug or have a feature request? [Open an issue](https://github.com/SilverMind-Project/cognitive-companion/issues) on GitHub. Good bug reports include:

- Steps to reproduce the issue
- Expected vs actual behavior
- System information (OS, Python version, GPU model)
- Relevant log output

### Submit Code

1. **Fork** the repository
2. **Create a branch** from `main` for your changes
3. **Follow** the [code standards](/development/code-standards)
4. **Test** your changes locally
5. **Submit** a pull request with a clear description

### Improve Documentation

Documentation improvements are always welcome. This docs site is built with [VitePress](https://vitepress.dev/) and lives in a separate repository. See the docs site's AGENTS.md for content guidelines.

### Share Configurations

If you've built interesting pipeline configurations or rule sets, consider sharing them as examples in the documentation.

## Development Workflow

### Setting Up

Follow the [Development Setup](/development/setup) guide to get your local environment running.

### Making Changes

1. **Read the code** before modifying it. Understand the existing patterns.
2. **Follow existing conventions.** Don't introduce new abstractions where existing patterns work.
3. **Keep changes focused.** One feature or fix per pull request.
4. **Update documentation** if your change affects user-facing behavior.

### Code Review Checklist

Before submitting a PR, verify:

- [ ] All imports are at the top of the file (PEP 8)
- [ ] No `print()` statements; use `get_logger()`
- [ ] No bare `catch {}` blocks; all errors are logged
- [ ] No `alert()` or `confirm()` in Vue views; use composables
- [ ] New endpoints have permission entries in `config/auth.yaml`
- [ ] Services are accessed via `request.app.state`, not instantiated in routers
- [ ] No secrets are hardcoded; use `${ENV_VAR}` interpolation
- [ ] `ruff check` and `ruff format` pass
- [ ] Frontend builds without errors

### Commit Messages

Use clear, descriptive commit messages:

```
Add activity detection pipeline step

Implements the activity_detection step type for recording
person activities (eating, sleeping, medication) during
pipeline execution. Activities are stored as PersonActivity
records for use as context filters in downstream rules.
```

## Architecture Decisions

When proposing significant changes, consider:

- **Privacy**: Does this maintain the on-premise, privacy-first architecture?
- **Composability**: Does this work with the pipeline step model?
- **Simplicity**: Is this the simplest solution that works?
- **Backward compatibility**: Will existing rules and configurations continue to work?

## Community

- **GitHub Issues**: bug reports, feature requests, and discussions
- **Pull Requests**: code and documentation contributions

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) license.
