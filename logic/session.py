from random import Random

from data.xor import XOR_DATA
from logic.network import NeuralNetwork
from logic.training import train as train_network


class XORSession:
    def __init__(self):
        self.network = None

    def train(self, learning_rate=0.25, max_epochs=10_000, target_loss=0.01, seed=None):

        if max_epochs < 1:
            raise ValueError("El máximo de épocas debe ser mayor que cero.")

        rng = Random(seed)

        network = NeuralNetwork(
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

        epochs, loss = train_network(network, learning_rate, max_epochs, target_loss, rng)

        self.network = network

        results = [self.predict(x1, x2) for (x1, x2), _ in XOR_DATA]

        return {
            "epochs": epochs,
            "loss": loss,
            "target_loss": target_loss,
            "stop_reason": "target_loss" if loss <= target_loss else "max_epochs",
            "correct_count": sum(row["is_correct"] for row in results),
            "total_cases": len(results),
            "results": results,
        }

    def predict(self, x1, x2):

        if self.network is None:
            raise RuntimeError("Primero debes entrenar la red.")

        if x1 not in (0, 1) or x2 not in (0, 1):
            raise ValueError("Las entradas deben ser 0 o 1.")

        _, _, output = self.network.forward(x1, x2)
        prediction = 1 if output >= 0.5 else 0
        expected = dict(XOR_DATA)[(x1, x2)]

        return {
            "inputs": [x1, x2],
            "output": output,
            "prediction": prediction,
            "expected": expected,
            "is_correct": prediction == expected,
        }