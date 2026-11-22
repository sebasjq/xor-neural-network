# XOR Lab

<p align="center"><img src="docs/interfaz.png" width="680" alt="Visualización de la red neuronal XOR"></p>

Una exploración visual del aprendizaje de una red neuronal. XOR Lab enseña cómo una red con una capa oculta puede aprender la operación XOR, cuyo patrón no se separa con una sola línea.

## Qué ocurre dentro de la red

Dos entradas se conectan con dos neuronas ocultas y una neurona de salida. Cada neurona combina sus entradas con pesos y sesgos y aplica una sigmoide. Durante el entrenamiento, la retropropagación compara la predicción con el resultado esperado y ajusta los parámetros para reducir el error. En la interfaz puedes observar las conexiones y activaciones, avanzar paso a paso o entrenar automáticamente, cambiar el ritmo y comparar las cuatro combinaciones de la tabla XOR.

## Probar XOR Lab

Descarga y ejecuta la aplicación portable para Windows; no requiere instalar Python.

<p align="center"><a href="https://github.com/sebasjq/xor-neural-network/releases/latest/download/XOR-Lab-1.0.0-portable.exe"><strong>⬇ Descargar XOR Lab para Windows</strong></a></p>

También puedes abrir el código con Python 3:

```bash
python -m interface.app
```

Luego visita `http://127.0.0.1:8000`.

## Equipo

- Simón Tomás Paipa Bravo
- Juan Sebastián Sánchez Quimbaya
