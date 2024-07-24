/* 
 * Score each prediction based on all available constraints. 
*/
export async function resolveConstraints(predictions, constraints) {
    const postConstraints = constraints.filter((constraint) => { return !constraint.isPre; });

    console.log('predictions', predictions, constraints);

    for (let sequence of predictions) {
        let sequenceTotal = 0;
        for (let constraint of postConstraints) {
            if (constraint.applies(sequence)) {
                const score = await constraint.evaluate(sequence.span, document);
                sequence.scores[constraint.name] = score;
                sequenceTotal += score;
            }
        }
        sequence.scores['total'] = sequenceTotal;
    }

    // filter out constraints that are lower than a threshold
    // const threshold = 0;
    // predictions = predictions.filter((prediction) => { return prediction.scores['total'] > threshold; });

    let sorted = predictions.sort((a, b) => {
        return b.scores['total'] - a.scores['total'];
    });

    return sorted;
}