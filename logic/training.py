from data.xor import XOR_DATA


def train_epoch(network, learning_rate, rng):

    examples = list(XOR_DATA)
    rng.shuffle(examples)

    for (x1, x2), target in examples:
        network.train_step(x1, x2, target, learning_rate)

# Calcula la pérdida media de la red neuronal. Como la 
# función de pérdida es el error cuadrático medio, la pérdida 
# para cada ejemplo es 0.5 * (target - output) ** 2. 
# La pérdida media se obtiene sumando las pérdidas de todos 
# los ejemplos y dividiendo entre el número total de ejemplos.

def mean_loss(network):
    total_loss = 0.0

    for (x1, x2), target in XOR_DATA:
        _, _, output = network.forward(x1, x2)
        total_loss += 0.5 * (target - output) ** 2

    return total_loss / len(XOR_DATA)


def train(network, learning_rate, max_epochs, target_loss, rng):

    for epoch in range(1, max_epochs + 1):

        train_epoch(network, learning_rate, rng)
        loss = mean_loss(network)

        if loss <= target_loss:
            return epoch, loss

    return epoch, loss