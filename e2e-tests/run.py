import atexit
import inspect
import logging
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import IO, Any, Dict, List, Optional

logging.basicConfig(level=logging.DEBUG, format="%(levelname)s\t%(name)s %(message)s")
log = logging.getLogger(__name__)

frontend_port: int = 3045
backend_port: int = frontend_port + 1
httpbin_port: int = frontend_port + 2

child_processes: List[subprocess.Popen] = []

e2e_tests_path: Path = Path(".").resolve()
root_path: Path = e2e_tests_path.parent
backend_path: Path = root_path / "backend"
frontend_path: Path = root_path / "frontend"
venv_bin: Path = root_path / "venv" / "bin"

log.debug("e2e_tests_path: %r.", e2e_tests_path)
log.debug("backend_path: %r.", backend_path)
log.debug("frontend_path: %r.", frontend_path)


@atexit.register
def kill_all():
	for proc in child_processes:
		if proc is not None and proc.poll() is None:
			log.info("Killing process %r.", proc)
			proc.kill()


def main():
	backend_ready_event = threading.Event()
	threading.Thread(target=prestige_backend, args=(backend_ready_event, )).start()

	frontend_ready_event = threading.Event()
	threading.Thread(target=prestige_frontend, args=(frontend_ready_event, )).start()

	httpbin_ready_event = threading.Event()
	threading.Thread(target=httpbin, args=(httpbin_ready_event, )).start()

	backend_ready_event.wait(4)
	frontend_ready_event.wait(4)
	httpbin_ready_event.wait(4)

	time.sleep(5)
	run_tests()


def prestige_backend(ready_event: Optional[threading.Event] = None):
	# 1. Backend server process.
	backend_env = {
		"DJANGO_SETTINGS_MODULE": "prestige.settings",
		"PRESTIGE_UNIVERSE": "e2e_tests",
		"PRESTIGE_ENV": "development",
		"PRESTIGE_SECRET_KEY": "e2e-secret-key",
		"PRESTIGE_CORS_ORIGINS": f"http://localhost:{frontend_port}",
		"PRESTIGE_PROXY_DISALLOW_HOSTS": "",
		"DATABASE_URL": "sqlite://:memory:",
	}

	spawn_process(
		[
			venv_bin / "python",
			"manage.py",
			"migrate",
		],
		cwd=backend_path,
		env=backend_env,
	).wait()

	spawn_process(
		[
			venv_bin / "python",
			"manage.py",
			"runserver",
			"--noreload",
			backend_port,
		],
		cwd=backend_path,
		env=backend_env,
	)

	if ready_event is not None:
		ready_event.set()


def spawn_process(cmd, *, cwd: Path = None, env: Dict[str, str] = None) -> subprocess.Popen:
	kwargs: Dict[str, Any] = {
		"cwd": str(cwd or root_path),
	}

	if env is not None:
		kwargs["env"] = {**os.environ, **{str(k): str(v) for k, v in env.items()}}

	log_target = logging.getLogger(inspect.stack()[1].function)
	kwargs.update(stdout=subprocess.PIPE, stderr=subprocess.PIPE)

	log_target.info("Running %r.", cmd)
	process = subprocess.Popen([str(c) for c in cmd], **kwargs)

	if log_target is not None:
		pipe_file_to_log(process.stdout, log_target, logging.INFO)
		pipe_file_to_log(process.stderr, log_target, logging.WARNING)

	child_processes.append(process)
	return process


def pipe_file_to_log(file: Optional[IO], logger: logging.Logger, level: int):
	if file is None:
		return

	def watcher():
		for line in file:
			logger.log(level, "%s", line.decode("UTF-8")[:-1])

	threading.Thread(target=watcher, daemon=True).start()


def prestige_frontend(ready_event: Optional[threading.Event] = None):
	# 2. Frontend server process.
	spawn_process(
		["make", "build-frontend"],
		env={
			"PRESTIGE_BACKEND": f"http://localhost:{backend_port}",
		},
	).wait()

	spawn_process(
		[
			venv_bin / "python",
			"-m",
			"http.server",
			frontend_port,
		],
		cwd=frontend_path / "dist",
	)

	if ready_event is not None:
		ready_event.set()


def httpbin(ready_event: Optional[threading.Event] = None):
	# 3. A local httpbin server process.
	spawn_process(
		[
			venv_bin / "flask",
			"run",
			"-p",
			httpbin_port,
		],
		cwd=e2e_tests_path,
		env={
			"FLASK_APP": "httpbin:app",
		},
	)

	if ready_event is not None:
		ready_event.set()


def run_tests():
	spawn_process(
		[
			venv_bin / "python",
			"-m",
			"unittest",
			"discover",
			"--start-directory",
			"src",
		],
		cwd=e2e_tests_path,
		env={
			"PATH": str(e2e_tests_path / "drivers") + ":" + os.environ.get("PATH", ""),
			"PYTHONPATH": str(e2e_tests_path / "src"),
			"FRONTEND_URL": f"http://localhost:{frontend_port}",
			"HTTPBIN_URL": f"http://localhost:{httpbin_port}",
		},
	).wait()


if __name__ == '__main__':
	main()
