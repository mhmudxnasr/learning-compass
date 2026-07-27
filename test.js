const safeString = '"foo\\nbar"';
const htmlPage = `let x = ${safeString};`;
console.log(htmlPage);
