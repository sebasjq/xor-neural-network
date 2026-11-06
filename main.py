from logic.network import NeuralNetwork


def show_parameters(network):
    print(f"x1 → h1: {network.w_x1_h1:.6f}")
    print(f"x1 → h2: {network.w_x1_h2:.6f}")
    print(f"x2 → h1: {network.w_x2_h1:.6f}")
    print(f"x2 → h2: {network.w_x2_h2:.6f}")
    print(f"h1 → o:  {network.w_h1_o:.6f}")
    print(f"h2 → o:  {network.w_h2_o:.6f}")
    print(f"Bias h1: {network.b_h1:.6f}")
    print(f"Bias h2: {network.b_h2:.6f}")
    print(f"Bias o:  {network.b_o:.6f}")


def main():
    network = NeuralNetwork(
        w_x1_h1=0.3,
        w_x1_h2=0.2,
        w_x2_h1=0.6,
        w_x2_h2=-0.4,
        w_h1_o=0.5,
        w_h2_o=0.7,
        b_h1=0.1,
        b_h2=0.1,
        b_o=0.1,
    )

    x1, x2 = 0, 1
    target = 1
    learning_rate = 0.25

    print(f"Primera entrada: ({x1}, {x2}) | Objetivo: {target}")
    print("\nParámetros iniciales")
    show_parameters(network)

    h1, h2, output, delta_o, delta_h1, delta_h2 = network.train_step(
        x1, x2, target, learning_rate
    )

    print("\nActivaciones y deltas de la primera iteración")
    print(f"h1 = {h1:.6f} | h2 = {h2:.6f} | salida = {output:.6f}")
    print(f"delta_o  = {delta_o:.6f}")
    print(f"delta_h1 = {delta_h1:.6f}")
    print(f"delta_h2 = {delta_h2:.6f}")

    print("\nParámetros actualizados")
    show_parameters(network)

    h1, h2, output = network.forward(1, 1)
    print("\nSegunda entrada: (1, 1) | Objetivo XOR: 0")
    print(f"h1 = {h1:.6f} | h2 = {h2:.6f} | salida = {output:.6f}")


if __name__ == "__main__":
    main()