/* 
 * Score each prediction based on all available constraints. 
 * TODO determine if we want to allow predictions to 
 * a.) be of any token type
 * b.) resolve them to words earlier
 * c.) resolve them to words here
 * d.) ignore them if they are not words
*/
export async function resolveConstraints(predictions, constraints, opening, sort=true, threshold=0, comparator='total', sortByAttribute='total') {
    const postConstraints = constraints.filter((constraint) => { return !constraint.isPre; });

    let accepted = [];
    let rejected = [];

    for (let sequence of predictions) {
        let sequenceTotal = 0;
        let reject = false;
        for (let constraint of postConstraints) {
            // if (constraint.applies(sequence)) {
            if (constraint.applies(opening)) {
                const score = await constraint.getScore(sequence, document);
                sequence.scores[constraint.name] = {'value': score, 'constraint': constraint};
                sequenceTotal += score;

                if (!constraint.evaluate(score, threshold)) { reject = true;}
            }
        }
        sequence.scores['total'] = {'value': sequenceTotal, 'constraint': null}
        sequence.setAttribute('total', sequenceTotal);
        if (!reject) { accepted.push(sequence); }
        else         { rejected.push(sequence); }
    }

    let all = [...accepted, ...rejected];

    if (sort) {
        accepted = sortPredictions(accepted, comparator, sortByAttribute);
        rejected = sortPredictions(rejected, comparator, sortByAttribute);
        all = sortPredictions(all, comparator, sortByAttribute);
    }

    return {
        accepted,
        rejected,
        all
    }
}

export function sortPredictions(scoredPredictions, comparator, sortByAttribute) {
    if(scoredPredictions == null || scoredPredictions.length == 0) {
        return [];
    }

    let sortedPredictions = scoredPredictions.sort((a, b) => {
        if (sortByAttribute) {
            // console.log('comparator', comparator, 'by attribute', a, b, a.getAttribute(comparator), b.getAttribute(comparator));
            let aScore = a.getAttribute(comparator);
            let bScore = b.getAttribute(comparator);
            return bScore - aScore;
        }
        // console.log('comparator', comparator, 'by score', a.scores[comparator].value, b.scores[comparator].value);
        return b.scores[comparator].value - a.scores[comparator].value;
    });

    return sortedPredictions;
}