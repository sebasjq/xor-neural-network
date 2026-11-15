import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse

from logic.session import XORSession


ROOT = Path(__file__).parent
HOST = "127.0.0.1"
PORT = 8000


class AppState:
    def __init__(self):
        self.session = XORSession()
        self.learning_rate = 0.25
        self.max_epochs = 10000
        self.target_loss = 0.01
        self.seed = None
        self.last_step = None
        self.lock = Lock()

    def configuration(self):
        return {
            "learning_rate": self.learning_rate,
            "max_epochs": self.max_epochs,
            "target_loss": self.target_loss,
            "seed": self.seed,
        }

    def snapshot(self):
        session = self.session
        network = session.network
        parameters = vars(network).copy() if network else {}
        state = {
            "ready": network is not None,
            "configuration": self.configuration(),
            "progress": {
                "epochs": getattr(session, "_epochs", 0),
                "iteration": getattr(session, "_example_index", 0),
                "loss": getattr(session, "_loss", None),
                "stop_reason": getattr(session, "_stop_reason", None),
                "loss_history": [
                    {"epoch": epoch, "loss": loss}
                    for epoch, loss in enumerate(
                        getattr(session, "_loss_history", []), start=1
                    )
                ],
            },
            "parameters": parameters,
            "last_step": self.last_step,
            "predictions": [],
        }

        if network and (session._epochs > 0 or session._example_index > 0):
            state["predictions"] = [
                session.predict(x1, x2)
                for x1, x2 in ((0, 0), (0, 1), (1, 0), (1, 1))
            ]
        return state


APP_STATE = AppState()


def clean_number(value, name, minimum=None):
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{name} debe ser numérico.") from error
    if minimum is not None and number < minimum:
        raise ValueError(f"{name} debe ser mayor o igual que {minimum}.")
    return number


def apply_configuration(payload):
    learning_rate = clean_number(payload.get("learning_rate", 0.25), "La tasa", 0)
    target_loss = clean_number(payload.get("target_loss", 0.01), "La pérdida objetivo", 0)
    max_epochs_value = payload.get("max_epochs", 10000)
    try:
        max_epochs = int(max_epochs_value)
    except (TypeError, ValueError) as error:
        raise ValueError("El máximo de épocas debe ser un entero.") from error
    if max_epochs < 1:
        raise ValueError("El máximo de épocas debe ser mayor que cero.")

    seed_value = payload.get("seed")
    seed = None if seed_value in (None, "") else int(seed_value)
    APP_STATE.learning_rate = learning_rate
    APP_STATE.max_epochs = max_epochs
    APP_STATE.target_loss = target_loss
    APP_STATE.seed = seed


def reset_session(payload):
    apply_configuration(payload)
    APP_STATE.session.start(
        learning_rate=APP_STATE.learning_rate,
        max_epochs=APP_STATE.max_epochs,
        target_loss=APP_STATE.target_loss,
        seed=APP_STATE.seed,
    )
    APP_STATE.last_step = None


def train_session(payload):
    apply_configuration(payload)
    summary = APP_STATE.session.train(
        learning_rate=APP_STATE.learning_rate,
        max_epochs=APP_STATE.max_epochs,
        target_loss=APP_STATE.target_loss,
        seed=APP_STATE.seed,
    )
    APP_STATE.last_step = {
        "kind": "train",
        "summary": summary,
    }


def execute_step():
    result = APP_STATE.session.step()
    APP_STATE.last_step = {"kind": "step", **result}


class RequestHandler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def serve_file(self, path):
        try:
            content = path.read_bytes()
        except FileNotFoundError:
            self.send_error(404)
            return
        content_type = "text/html; charset=utf-8"
        if path.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif path.suffix == ".js":
            content_type = "text/javascript; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/" or route == "/index.html":
            self.serve_file(ROOT / "static" / "index.html")
        elif route in ("/app.js", "/style.css"):
            self.serve_file(ROOT / "static" / route.lstrip("/"))
        elif route == "/api/state":
            with APP_STATE.lock:
                self.send_json(APP_STATE.snapshot())
        else:
            self.send_error(404)

    def do_POST(self):
        route = urlparse(self.path).path
        if not route.startswith("/api/"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            with APP_STATE.lock:
                if route == "/api/start":
                    reset_session(body)
                elif route == "/api/step":
                    execute_step()
                elif route == "/api/train":
                    train_session(body)
                else:
                    self.send_error(404)
                    return
                self.send_json(APP_STATE.snapshot())
        except (ValueError, RuntimeError) as error:
            self.send_json({"error": str(error)}, 400)
        except Exception as error:
            self.send_json({"error": str(error)}, 500)

    def log_message(self, format_string, *args):
        return


def run():
    server = ThreadingHTTPServer((HOST, PORT), RequestHandler)
    print(f"Interfaz disponible en http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nInterfaz detenida.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
