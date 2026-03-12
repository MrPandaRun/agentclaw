---
name: release-publisher
description: Use when asked to bump a version, build desktop installers, tag and push a release, and publish a GitHub release for this repository. Covers macOS arm64/x64, Windows x64 installer packaging, English release notes, and common retry handling for local packaging issues.
argument-hint: "[version]"
disable-model-invocation: true
---

# Release Publisher

This is the Claude Code project-skill entrypoint for repository releases.

Read `docs/release-publisher-playbook.md` before doing any release work, then follow it.

Use this skill when the user asks to:
- publish a new version
- bump a release version and package installers
- create or update a GitHub release
- upload macOS or Windows release artifacts

Prefer the shared playbook over duplicating release logic here so Claude Code and Codex stay aligned.
