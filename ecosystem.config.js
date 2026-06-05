module.exports = {
  apps: [
    {
      name: "debate-backend",
      cwd: "./backend",
      script: ".venv/bin/uvicorn",
      args: "app.main:app --host 0.0.0.0 --port 8000",
      interpreter: "none",
    },
    {
      name: "debate-frontend",
      cwd: "./frontend",
      script: "npm",
      args: "run preview -- --host 0.0.0.0 --port 5173",
      interpreter: "none",
    },
  ],
};
