#!/usr/bin/env node
import * as core from "@actions/core";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import * as semver from "semver";
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated";
import { join } from "node:path";

const token = core.getInput("wit-bindgen-token");
const octokit = token
  ? github.getOctokit(token)
  : github.getOctokit(undefined!, {
      authStrategy: createUnauthenticatedAuth,
      auth: { reason: "no 'wit-bindgen-token' input" },
    });

const versionRaw = core.getInput("wit-bindgen-version");
let version: string;
if (versionRaw === "latest") {
  const { data } = await octokit.rest.repos.getLatestRelease({
    owner: "bytecodealliance",
    repo: "wit-bindgen",
  });
  version = data.tag_name.slice(1);
} else {
  const releases = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner: "bytecodealliance",
    repo: "wit-bindgen",
  });
  const versions = releases.map((release) => release.tag_name.slice(1));
  version = semver.maxSatisfying(versions, versionRaw)!;
}
core.debug(`Resolved version: v${version}`);
if (!version) throw new DOMException(`${versionRaw} resolved to ${version}`);

let found = tc.find("wit-bindgen", version);
core.setOutput("cache-hit", !!found);
if (!found) {
  const target = {
    "darwin,x64": "x86_64-macos",
    "darwin,arm64": "aarch64-macos",
    "linux,x64": "x86_64-linux",
    "linux,arm64": "aarch64-linux",
    "win32,x64": "x86_64-windows",
  }[[process.platform, process.arch].toString()]!;
  const archiveExt = {
    win32: ".zip",
    darwin: ".tar.gz",
    linux: ".tar.gz",
  }[process.platform as string];
  const archive = `wit-bindgen-v${version}-${target}${archiveExt}`;
  const folder = `wit-bindgen-v${version}-${target}`;

  const url = `https://github.com/bytecodealliance/wit-bindgen/releases/download/wit-bindgen-cli-${version}/${archive}`;
  core.info(`Fetching from '${url}'`);
  found = await tc.downloadTool(url);
  if (archive.endsWith(".zip")) {
    const unzipped = await tc.extractZip(found);
    found = join(unzipped, folder);
  } else {
    const unzipped = await tc.extractTar(found);
    found = join(unzipped, folder);
  }
  found = await tc.cacheDir(found, "wit-bindgen", version);
}
core.addPath(found);
core.setOutput("wit-bindgen-version", version);
core.info(`✅ wit-bindgen v${version} installed!`);
