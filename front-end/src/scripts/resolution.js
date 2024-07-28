/* 
 * Score each prediction based on all available constraints. 
 * TODO determine if we want to allow predictions to 
 * a.) be of any token type
 * b.) resolve them to words earlier
 * c.) resolve them to words here
 * d.) ignore them if they are not words
*/
export async function resolveConstraints(predictions, constraints) {
    const postConstraints = constraints.filter((constraint) => { return !constraint.isPre; });

    let filtered = [];
    for (let sequence of predictions) {
        let sequenceTotal = 0;
        let reject = false;
        for (let constraint of postConstraints) {
            if (constraint.applies(sequence)) {
                const score = await constraint.getScore(sequence, document);
                sequence.scores[constraint.name] = {'value': score, 'constraint': constraint};
                sequenceTotal += score;

                if (!constraint.evaluate(score)) { reject = true;}
            }
        }
        sequence.scores['total'] = {'value': sequenceTotal, 'constraint': null}
        if (!reject) { filtered.push(sequence); }
    }

    return filtered;
}

// todo
export async function sortPredictions(scoredPredictions, constraintName) {
    let sortedPredictions = scoredPredictions.sort((a, b) => {
        let aScore = a.scores[constraintName].value;
        let bScore = b.scores[constraintName].value;
        return bScore - aScore;
    });

    return sortedPredictions;
}