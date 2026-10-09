const { app, BrowserWindow } = require("electron");

// This fixture runs only the API client against synthetic loopback servers.
// It never loads the production main process or opens the user's database.
app.setPath("userData", process.env.FREESTYLE_API_TEST_PROFILE);
app.whenReady().then(() => {
  const window = new BrowserWindow({ show: false });
  window.loadURL(process.env.FREESTYLE_API_TEST_RENDERER);
});
