module.exports = {
  apps: [
    {
      name: "hear-backend",
      cwd: "./backend",
      script: ".venv/bin/uvicorn",
      args: "app.main:app --host 127.0.0.1 --port 8000",
      interpreter: "none",
    },
  ],
};
