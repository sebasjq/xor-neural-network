# Lógica de la red neuronal XOR

La red tiene dos entradas binarias, dos neuronas ocultas y una neurona de salida. La interfaz se conecta a `XORSession`.

| Archivo | Responsabilidad |
|---|---|
| `network.py` | Define la red 2–2–1, calcula sus salidas y actualiza los pesos y *bias* por retropropagación. |
| `training.py` | Baraja los cuatro casos en cada época, calcula la pérdida promedio y aplica las condiciones de parada. |
| `session.py` | Inicia una corrida, conserva la última red entrenada y devuelve los resultados que consume la interfaz. |

## Integración con una interfaz Python

La interfaz mantiene una instancia de `XORSession` mientras está abierta. Los botones **Entrenar** y **Predecir** comparten esa instancia para trabajar con la misma red.

```python
from logic.session import XORSession

session = XORSession()

summary = session.train(learning_rate=0.25, max_epochs=10_000, target_loss=0.01)
result = session.predict(0, 1)
```

Cada llamada a `train()` ejecuta **un solo intento**. Crea una red con pesos y *bias* aleatorios, usa los cuatro pares de XOR en cada época y guarda la red resultante. **Entrenar de nuevo** reemplaza la red anterior. `predict(x1, x2)` usa la última red guardada para consultar un par, sin actualizar sus parámetros.

## Configuración del entrenamiento

| Argumento de `train()` | Valor predeterminado | Uso |
|---|---:|---|
| `learning_rate` | `0.25` | Tasa de aprendizaje. |
| `max_epochs` | `10_000` | Límite de épocas por intento. Se recibe como entero positivo. |
| `target_loss` | `0.01` | Pérdida promedio requerida para detenerse antes del límite. |
| `seed` | `None` | El valor `None` permite variar la corrida. Una semilla entera, como `1`, hace reproducibles la inicialización y el barajado. |

## Datos que recibe la interfaz

`train()` devuelve un diccionario con estos campos:

| Campo | Qué representa |
|---|---|
| `epochs` | Épocas realizadas en el último intento. |
| `loss` | Pérdida promedio final. |
| `target_loss` | Pérdida objetivo de la corrida. |
| `stop_reason` | `"target_loss"` si se alcanzó la pérdida objetivo, o `"max_epochs"` si se agotó el límite sin alcanzarla. |
| `correct_count` y `total_cases` | Aciertos y número total de casos. |
| `results` | Lista de cuatro predicciones para mostrar la tabla de resultados. |

Cada fila de `results` tiene el mismo formato que devuelve `predict()`. Este ejemplo corresponde a `session.train(seed=1)`, con la salida redondeada para mostrarla:

```json
{
  "inputs": [0, 1],
  "output": 0.878978,
  "prediction": 1,
  "expected": 1,
  "is_correct": true
}
```

La clasificación usa un umbral de `0.5`. Si la salida es mayor o igual a ese valor, la predicción es `1`. En caso contrario, es `0`.

## Comportamiento de los botones

| Estado | Comportamiento de la interfaz |
|---|---|
| Sin entrenamiento previo | **Predecir** permanece deshabilitado. La sesión lanza `RuntimeError` si se invoca `predict()` en este estado. |
| Entrenamiento finalizado | La interfaz muestra los aciertos y el motivo de parada por separado. Una red puede acertar los cuatro casos y aun así terminar por el límite de épocas. |
| Clasificación incorrecta | La tabla identifica los pares que fallaron. El usuario puede consultar la última red o iniciar otro intento con **Entrenar de nuevo**. |

La interfaz entrega `x1` y `x2` como enteros `0` o `1`. Si los selectores devuelven texto, la interfaz lo convierte antes de llamar a `predict()`. La sesión lanza `ValueError` ante entradas fuera de `0` y `1` o cuando `max_epochs` es menor que uno.
