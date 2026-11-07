# Lógica de la red neuronal XOR

La red tiene una arquitectura **2–2–1**. Recibe dos bits (`x1` y `x2`), calcula las activaciones de dos neuronas ocultas (`h1` y `h2`) y produce una salida mediante una sigmoide. El entrenamiento usa los cuatro pares y sus valores esperados, definidos en [`data/xor.py`](../data/xor.py).

## `network.py`

Define la función `sigmoid(z)`, que transforma una suma ponderada en una activación entre cero y uno, y la clase `NeuralNetwork`.

| Método | Responsabilidad |
|---|---|
| `__init__(...)` | Guarda los seis pesos de las conexiones y los tres *bias*, uno por neurona oculta y uno para la salida. |
| `forward(x1, x2)` | Calcula y devuelve `h1`, `h2` y la salida decimal para el par recibido. |
| `calculate_deltas(x1, x2, target)` | Calcula los deltas de salida y de la capa oculta a partir del error entre el objetivo y la salida. |
| `train_step(x1, x2, target, learning_rate)` | Ejecuta una iteración con un par, actualiza los pesos y *bias* y devuelve las activaciones y los deltas calculados antes del ajuste. |

## `training.py`

| Función | Responsabilidad |
|---|---|
| `train_epoch(network, learning_rate, rng)` | Baraja los cuatro pares y aplica una actualización por cada uno. |
| `mean_loss(network)` | Evalúa los cuatro pares con los parámetros actuales. Calcula `0.5 * (target - output) ** 2` para cada par y devuelve el promedio. |
| `train(network, learning_rate, max_epochs, target_loss, rng)` | Entrena una red recibida por épocas completas y devuelve el número de épocas y la pérdida final. |

## `session.py`

`XORSession` conserva la red actual, la configuración del intento y la posición dentro de la época. Una época contiene cuatro iteraciones. Tanto el entrenamiento automático como el avance individual usan la misma secuencia de pares.

| Método | Responsabilidad |
|---|---|
| `__init__()` | Crea una sesión vacía. La red se inicializa al comenzar un intento. |
| `start(...)` | Crea una red nueva con pesos y *bias* aleatorios entre `-1` y `1`, guarda la configuración y reinicia el progreso. |
| `step()` | Entrena con el siguiente par y devuelve los datos de esa actualización. Si la sesión está vacía, inicia un intento con los valores predeterminados. Si el intento terminó, requiere un nuevo `start()`. |
| `train(...)` | Completa el intento activo desde el siguiente par con la red y la configuración ya guardadas. Si la sesión está vacía o el intento anterior terminó, crea una red nueva con los argumentos recibidos. |
| `predict(x1, x2)` | Evalúa un par de bits con la red actual después de al menos una iteración. Devuelve la salida decimal, la predicción y su comparación con el valor esperado. |
| `_advance()` | Método interno compartido por `step()` y `train()`. Baraja los pares al inicio de cada época, actualiza la red con el par siguiente y comprueba la pérdida y el límite al completar los cuatro pares. |

Si se ejecutan dos llamadas a `step()` antes de `train()`, el entrenamiento automático continúa con el tercer par de esa misma época. Los argumentos de configuración se aplican al iniciar un intento nuevo.

### Configuración

| Argumento de `start()` o `train()` al iniciar un intento | Valor predeterminado | Descripción |
|---|---:|---|
| `learning_rate` | `0.25` | Controla el tamaño de los ajustes de pesos y *bias*. |
| `max_epochs` | `10_000` | Número máximo de épocas por intento. Debe ser un entero positivo. |
| `target_loss` | `0.01` | Valor máximo de pérdida promedio para considerar alcanzado el objetivo. |
| `seed` | `None` | Con `None`, la inicialización y el barajado pueden variar entre intentos. Una semilla entera permite repetir la corrida. |

La ejecución por consola en [`main.py`](../main.py) usa `XORSession` con una pérdida objetivo de `0.001`.

### Resultados

- **`step()`** devuelve `epoch`, `iteration`, `inputs`, `expected`, `activations_before`, `deltas`, `parameters_before` y `parameters_after`. `epoch_completed` indica si se completaron los cuatro pares. `epoch_loss` contiene la pérdida de esa época al completarla y vale `None` en los demás pasos.
- **`train()`** devuelve `epochs`, `loss`, `target_loss`, `stop_reason`, `correct_count`, `total_cases` y `results`. Esta última lista contiene la predicción para cada uno de los cuatro pares.
- **`predict()`** devuelve `inputs`, `output`, `prediction`, `expected` e `is_correct`. Una salida decimal mayor o igual a `0.5` se clasifica como `1`. Una salida menor se clasifica como `0`. El cálculo del error durante el entrenamiento usa la salida decimal.

`stop_reason` vale `"target_loss"` cuando se alcanza la pérdida objetivo o `"max_epochs"` cuando se llega al límite de épocas. En el resultado de `step()`, vale `None` mientras el intento siga activo. Los aciertos y la pérdida son medidas distintas. La red puede clasificar correctamente los cuatro pares sin alcanzar la pérdida objetivo.

La sesión lanza `ValueError` si el límite de épocas no es un entero positivo o si las entradas de `predict()` están fuera de `0` y `1`. Lanza `RuntimeError` si se solicita una predicción antes de la primera iteración o si se intenta avanzar un intento que ya terminó.
