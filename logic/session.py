from random import Random

from data.xor import XOR_DATA
from logic.network import NeuralNetwork
from logic.training import mean_loss


class XORSession:
    def __init__(self):
        self.network = None

    # Los parámetros de entrenamiento incluyen la tasa de aprendizaje,
    # el número máximo de épocas, la pérdida objetivo y una semilla
    # opcional para la generación de números aleatorios.
    def start(self, learning_rate=0.25, max_epochs=10_000, target_loss=0.01, seed=None):
        """Inicializa una red y su configuración para un nuevo intento."""
        if type(max_epochs) is not int or max_epochs < 1:
            raise ValueError("El máximo de épocas debe ser un entero mayor que cero.")

        rng = Random(seed)

        # Inicializa la red neuronal con pesos y bias aleatorios
        # en el rango [-1, 1] y la guarda en la sesión para su uso posterior.
        self.network = NeuralNetwork(
            w_x1_h1=rng.uniform(-1, 1),
            w_x2_h1=rng.uniform(-1, 1),
            w_x1_h2=rng.uniform(-1, 1),
            w_x2_h2=rng.uniform(-1, 1),
            w_h1_o=rng.uniform(-1, 1),
            w_h2_o=rng.uniform(-1, 1),
            b_h1=rng.uniform(-1, 1),
            b_h2=rng.uniform(-1, 1),
            b_o=rng.uniform(-1, 1),
        )

        self._rng = rng
        self._learning_rate = learning_rate
        self._max_epochs = max_epochs
        self._target_loss = target_loss
        self._examples = []
        self._example_index = 0
        self._epochs = 0
        self._loss = None
        self._stop_reason = None


    # Continúa el intento activo o inicia uno nuevo con 
    # los argumentos recibidos.
    def step(self):

        if self.network is None:
            self.start()
        if self._stop_reason is not None:
            raise RuntimeError("El intento terminó. Inicia una red nueva para avanzar.")

        epoch = self._epochs + 1
        iteration = self._example_index + 1

        # Conserva los parámetros anteriores para comparar el cambio en la interfaz.
        parameters_before = vars(self.network).copy()
        x1, x2, target, values = self._advance()
        h1, h2, output, delta_o, delta_h1, delta_h2 = values
        epoch_completed = self._epochs == epoch

        return {
            "epoch": epoch,
            "iteration": iteration,
            "inputs": [x1, x2],
            "expected": target,
            "activations_before": {"h1": h1, "h2": h2, "output": output},
            "deltas": {"h1": delta_h1, "h2": delta_h2, "output": delta_o},
            "parameters_before": parameters_before,
            "parameters_after": vars(self.network).copy(),
            "epoch_completed": epoch_completed,
            "epoch_loss": self._loss if epoch_completed else None,
            "stop_reason": self._stop_reason,
        }

    # Entrena la red neuronal para resolver el problema XOR.
    def train(self, learning_rate=0.25, max_epochs=10_000, target_loss=0.01, seed=None):
        """Continúa el intento activo o inicia uno nuevo con los argumentos recibidos."""
        if self.network is None or self._stop_reason is not None:
            self.start(learning_rate, max_epochs, target_loss, seed)

        # Entrena desde la siguiente iteración con los parámetros
        # del intento activo hasta que se cumple una condición de parada.
        while self._stop_reason is None:
            self._advance()

        # Calcula los resultados de la red neuronal entrenada
        # para cada ejemplo del conjunto de datos XOR.
        results = [self.predict(x1, x2) for (x1, x2), _ in XOR_DATA]
        return {
            "epochs": self._epochs,
            "loss": self._loss,
            "target_loss": self._target_loss,
            "stop_reason": self._stop_reason,
            "correct_count": sum(row["is_correct"] for row in results),
            "total_cases": len(results),
            "results": results,
        }

    def _advance(self):
        # Baraja los cuatro pares al empezar una época y conserva ese orden.
        if self._example_index == 0:
            self._examples = list(XOR_DATA)
            self._rng.shuffle(self._examples)

        (x1, x2), target = self._examples[self._example_index]
        values = self.network.train_step(x1, x2, target, self._learning_rate)
        self._example_index += 1

        # Evalúa la pérdida y las condiciones de parada al completar la época.
        if self._example_index == len(self._examples):
            self._example_index = 0
            self._epochs += 1
            self._loss = mean_loss(self.network)

            if self._loss <= self._target_loss:
                self._stop_reason = "target_loss"
            elif self._epochs == self._max_epochs:
                self._stop_reason = "max_epochs"

        return x1, x2, target, values

    # Predice la salida de la red neuronal para un par de entradas (x1, x2).
    def predict(self, x1, x2):

        if self.network is None or (self._epochs == 0 and self._example_index == 0):
            raise RuntimeError("Primero debes entrenar la red.")

        if x1 not in (0, 1) or x2 not in (0, 1):
            raise ValueError("Las entradas deben ser 0 o 1.")

        # Calcula la salida de la red para las entradas dadas y determina
        # si la predicción coincide con el valor esperado del conjunto de datos XOR.
        _, _, output = self.network.forward(x1, x2)
        prediction = 1 if output >= 0.5 else 0
        expected = dict(XOR_DATA)[(x1, x2)]

        # Devuelve las entradas, la salida, la predicción,
        # el valor esperado y si la predicción es correcta.
        return {
            "inputs": [x1, x2],
            "output": output,
            "prediction": prediction,
            "expected": expected,
            "is_correct": prediction == expected,
        }
