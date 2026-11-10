# xor-neural-network
Aplicación en Python que aprende la función XOR con una red neuronal 2–2–1 entrenada mediante retropropagación.

## Interfaz web

La interfaz visual conecta con `logic/session.py` y permite inspeccionar la red 2–2–1, avanzar iteración por iteración, entrenar automáticamente y explorar el diagrama con zoom y arrastre.

Para iniciarla desde la raíz del proyecto:

```bash
python -m interface.app
```

Después abre `http://127.0.0.1:8000`. La aplicación usa únicamente la biblioteca estándar de Python, por lo que no requiere instalar dependencias adicionales. La sesión se mantiene en memoria mientras el servidor está activo.
