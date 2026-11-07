from logic.session import XORSession


def main():
    session = XORSession()
    summary = session.train(
        learning_rate=0.25,
        max_epochs=10_000,
        target_loss=0.001,
    )

    print(f"Épocas realizadas: {summary['epochs']}")
    print(f"Pérdida promedio final: {summary['loss']:.6f}")

    if summary["stop_reason"] == "target_loss":
        print("Se alcanzó la pérdida objetivo.")
    else:
        print("Se alcanzó el máximo de épocas.")

    print("\nResultados finales")
    for row in summary["results"]:
        x1, x2 = row["inputs"]
        print(
            f"Entrada: ({x1}, {x2}) | Objetivo: {row['expected']} | "
            f"Salida: {row['output']:.6f} | Predicción: {row['prediction']}"
        )

    print(f"Aciertos: {summary['correct_count']}/{summary['total_cases']}")


if __name__ == "__main__":
    main()
