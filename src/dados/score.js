export const faixas_score = (score = 0) => {
    if (score >= 800) {
        return 'A';
    } else if (score >= 600) {
        return 'B';
    } else if (score >= 400) {
        return 'C';
    } else if (score >= 200) {
        return 'D';
    } else {
        return 'E';
    }
}