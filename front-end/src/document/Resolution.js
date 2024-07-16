export async function resolveConstraints(predictions, constraints) {
    const postConstraints = constraints.filter((constraint) => { return !constraint.isPre; });

    for (let predictedSpan of predictions) {
        console.log("predictedSpan", predictedSpan);
        let spanTotal = 0;
        for (let constraint of postConstraints) {
            if (constraint.applies(predictedSpan)) {
            const score = await constraint.evaluate(predictedSpan.span, document);
            predictedSpan.scores[constraint.name] = score;
            spanTotal += score;
            }
        }
        predictedSpan.scores['total'] = spanTotal;
    }

    // filter out constraints that are lower than a threshold
    const threshold = 0.0;
    let finalPredictions = predictions.filter((prediction) => { return prediction.scores['total'] > threshold; });

    let sorted = finalPredictions.sort((a, b) => {
        return b.scores['total'] - a.scores['total'];
    });

    return sorted;
}