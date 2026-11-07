from data.xor import XOR_DATA
from logic.network import NeuralNetwork
from logic.training import train

from random import Random

def main():

    rng = Random()

    network = NeuralNetwork(
        w_x1_h1 = rng.uniform(-1, 1),
        w_x2_h1 = rng.uniform(-1, 1),

        w_x1_h2 = rng.uniform(-1, 1),
        w_x2_h2 = rng.uniform(-1, 1),

        w_h1_o = rng.uniform(-1, 1),
        w_h2_o = rng.uniform(-1, 1),

        b_h1 = rng.uniform(-1, 1),
        b_h2 = rng.uniform(-1, 1),

        b_o = rng.uniform(-1, 1),
    )

    learning_rate = 0.25
    target_loss = 0.001 # Error minimo deseado para detener el entrenamiento.
    max_epochs = 10_000

    epoch, loss = train(
        network,
        learning_rate=learning_rate,
        max_epochs=max_epochs,
        target_loss=target_loss,
        rng=rng
    )

    print(f"Épocas realizadas: {epoch}")
    print(f"Pérdida promedio final: {loss:.6f}")

    if loss <= target_loss:
        print("Se alcanzó la pérdida objetivo.")
    else:
        print("Se alcanzó el máximo de épocas.")

    print("\nResultados finales")
    correct = 0

    for (x1, x2), target in XOR_DATA:
        _, _, output = network.forward(x1, x2)
        prediction = 1 if output >= 0.5 else 0

        if prediction == target:
            correct += 1

        print(
            f"Entrada: ({x1}, {x2}) | Objetivo: {target} | "
            f"Salida: {output:.6f} | Predicción: {prediction}"
        )

    print(f"Aciertos: {correct}/{len(XOR_DATA)}")


if __name__ == "__main__":
    main()