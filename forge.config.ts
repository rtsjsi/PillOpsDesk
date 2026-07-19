import type { ForgeConfig } from '@electron-forge/shared-types';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'node:fs/promises';
import path from 'node:path';

const iconPath = path.resolve(__dirname, 'assets/icons/icon');
const appManifestPath = path.resolve(__dirname, 'assets/windows/app.manifest');

const publisherName = 'PillOpsDesk';

/** Authenticode signing (required for Windows Smart App Control). Set env vars when you have a cert. */
function getWindowsSignOptions():
  | { certificateFile: string; certificatePassword?: string }
  | undefined {
  const certificateFile = process.env.WINDOWS_CERT_FILE;
  if (!certificateFile) return undefined;
  return {
    certificateFile,
    certificatePassword: process.env.WINDOWS_CERT_PASSWORD,
  };
}

const windowsSign = getWindowsSignOptions();

const PACKAGED_NODE_MODULES = [
  'better-sqlite3',
  'bindings',
  'file-uri-to-path',
];

async function copyPackagedNodeModules(buildPath: string): Promise<void> {
  const sourceNodeModules = path.resolve(__dirname, 'node_modules');
  const destNodeModules = path.resolve(buildPath, 'node_modules');

  await Promise.all(
    PACKAGED_NODE_MODULES.map(async (packageName) => {
      const sourcePath = path.join(sourceNodeModules, packageName);
      const destPath = path.join(destNodeModules, packageName);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.cp(sourcePath, destPath, { recursive: true });
    })
  );
}

const config: ForgeConfig = {
  buildIdentifier: 'release',
  packagerConfig: {
    asar: true,
    name: 'PillOpsDesk',
    executableName: 'pillopsdesk',
    icon: iconPath,
    win32metadata: {
      CompanyName: publisherName,
      ProductName: 'PillOpsDesk',
      FileDescription: 'Offline pharmacy management for medical stores',
      OriginalFilename: 'pillopsdesk.exe',
      InternalName: 'pillopsdesk',
      'application-manifest': appManifestPath,
    },
    ...(windowsSign ? { windowsSign } : {}),
    extraResource: [
      path.resolve(__dirname, 'assets/icons/icon.ico'),
      path.resolve(__dirname, 'assets/icons/icon.png'),
    ],
  },
  rebuildConfig: {},
  hooks: {
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      await copyPackagedNodeModules(buildPath);
    },
  },
  makers: [
    // Classic Windows wizard: progress page + Finish dialog with “Run” checkbox.
    // NSIS options live in package.json → build.nsis
    {
      name: '@electron-addons/electron-forge-maker-nsis',
      config: windowsSign
        ? {
            codesign: {
              certificateFile: windowsSign.certificateFile,
              certificatePassword: windowsSign.certificatePassword,
            },
          }
        : {},
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
