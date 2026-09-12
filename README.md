# Roomscape

Roomscape is a browser prototype for mapping a room, placing interactive anchors, and attaching local media to them. It is free to run because the current version stores room data in the browser's local storage.

## Put It On GitHub

The important part is the folder structure. Keep the deployment file here:

```text
.github/
	workflows/
		deploy.yml
```

You have two easy options:

### Option A: Upload the folder

1. Create a new GitHub repository named `ARVR`.
2. Choose **Add file > Upload files**.
3. Upload the project files and folders from this project.
4. Make sure `.github/workflows/deploy.yml` is included. GitHub may hide folders beginning with a dot, so use the file picker or create the folders in GitHub if needed.
5. Commit the upload to the `main` branch.

### Option B: Use Git from a terminal

Run these commands from the project folder:

```bash
git init
git add .
git commit -m "Initial Roomscape app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ARVR.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Camera access works on `localhost` during development.

## Publish To GitHub Pages

The file `.github/workflows/deploy.yml` is already the deployment action. You do not need to paste its contents into a form or rename its workflow title.

1. Open the repository on GitHub.
2. Open **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open the **Actions** tab and select **Deploy Roomscape**.
5. Wait for the green check mark.
6. Open the Pages URL shown by the workflow on your phone.

The URL should look like:

```text
https://YOUR-USERNAME.github.io/ARVR/
```

GitHub Pages supplies HTTPS, which is required for camera access. On the phone, allow camera permission when the browser asks.

If you choose a repository name other than `ARVR`, change the `base` value in `vite.config.ts` to `'/your-repository-name/'` before pushing. The repository name and this path must match exactly.

## Troubleshooting

- **The workflow does not appear:** confirm the file is exactly `.github/workflows/deploy.yml` on the `main` branch.
- **The page is blank:** confirm the repository name matches the `base` value in `vite.config.ts`.
- **The camera does not open:** use the GitHub Pages HTTPS URL, not a local file or an HTTP address, and allow camera permission.
- **My room disappeared:** room data is local to that browser and device. Use **Export room** to save a JSON backup.

## Real XR Requirements

The app now requests a real `immersive-ar` WebXR session with `hit-test`, optional depth sensing, and controller select events. It does not fabricate a room scan when XR is unavailable.

For the real scan path, use a supported Android phone with an ARCore-compatible Chrome/WebXR build, or a mixed-reality headset/browser that exposes WebXR AR. iPhone Safari and ordinary desktop browsers cannot provide this room-scanning session. An Xbox controller must be paired to the device and exposed through the browser Gamepad API.

The centered scan overlay is intentional: headset browsers can block or crop side panels, so scan state and the primary action stay in the central safe area.

Still planned for a production release:

- 3D persistent anchor objects rendered at hit-test poses
- Full depth mesh and wall/door/object classification
- Real MP4 playback and PDF reading surfaces inside XR
- Cross-device room synchronization and a native ARCore fallback