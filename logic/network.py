from math import exp

def sigmoid(z):
    return 1 / (1 + exp(-z))

class NeuralNetwork:

    # Constructor de la clase NeuralNetwork. Inicializa los pesos y bias de la red neuronal.
    def __init__(
        self,
        *, # Los parámetros deben ser pasados como argumentos con nombre. Para evitar confusiones.
        w_x1_h1, w_x1_h2,
        w_x2_h1, w_x2_h2,
        w_h1_o, w_h2_o,
        b_h1, b_h2, b_o,
    ):
        # Pesos de las entradas hacia la capa oculta.
        self.w_x1_h1 = w_x1_h1
        self.w_x1_h2 = w_x1_h2
        self.w_x2_h1 = w_x2_h1
        self.w_x2_h2 = w_x2_h2

        # Pesos de la capa oculta hacia la de salida.
        self.w_h1_o = w_h1_o
        self.w_h2_o = w_h2_o

        # Bias de cada neurona.
        self.b_h1 = b_h1
        self.b_h2 = b_h2
        self.b_o = b_o

    # Calcula la salida de la red neuronal para un par de entradas (x1, x2).
    def forward(self, x1, x2):

        # 1. Suma ponderada y activación de h1.
        z_h1 = x1 * self.w_x1_h1 + x2 * self.w_x2_h1 + self.b_h1
        h1 = sigmoid(z_h1)

        # 2. Suma ponderada y activación de h2.
        z_h2 = x1 * self.w_x1_h2 + x2 * self.w_x2_h2 + self.b_h2
        h2 = sigmoid(z_h2)

        # 3. Las activaciones h1 y h2 alimentan la neurona de salida.
        z_o = h1 * self.w_h1_o + h2 * self.w_h2_o + self.b_o
        output = sigmoid(z_o)

        return h1, h2, output

    # Una vez calculados los valores de h1, h2 y output, podemos usar estos 
    # valores para calcular el error y actualizar los pesos y bias de la red 
    # neuronal durante el proceso de entrenamiento.

    def calculate_deltas(self, x1, x2, target):
        h1, h2, output = self.forward(x1, x2)

        # 1. Error y delta de la neurona de salida.
        error = target - output
        delta_o = output * (1 - output) * error
 
        # 2. Propagar el delta de salida hacia h1 y h2.
        delta_h1 = h1 * (1 - h1) * self.w_h1_o * delta_o
        delta_h2 = h2 * (1 - h2) * self.w_h2_o * delta_o

        return h1, h2, output, delta_o, delta_h1, delta_h2


    # Actualiza los pesos y bias de la red neuronal utilizando los deltas calculados y la tasa de aprendizaje.
    # Se ejecuta solo una vez por cada ejemplo de entrenamiento en cada época.
    def train_step(self, x1, x2, target, learning_rate):

        h1, h2, output, delta_o, delta_h1, delta_h2 = (self.calculate_deltas(x1, x2, target))

        # Pesos y bias de la neurona de salida.
        self.w_h1_o += learning_rate * h1 * delta_o
        self.w_h2_o += learning_rate * h2 * delta_o
        self.b_o += learning_rate * delta_o

        # Pesos y bias de la neurona oculta h1.
        self.w_x1_h1 += learning_rate * x1 * delta_h1
        self.w_x2_h1 += learning_rate * x2 * delta_h1
        self.b_h1 += learning_rate * delta_h1

        # Pesos y bias de la neurona oculta h2.
        self.w_x1_h2 += learning_rate * x1 * delta_h2
        self.w_x2_h2 += learning_rate * x2 * delta_h2
        self.b_h2 += learning_rate * delta_h2

        return h1, h2, output, delta_o, delta_h1, delta_h2