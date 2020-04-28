const alFileManagement = require('../fileManagement/alFileManagement');
const constants = require('../constants');
const vscode = require("vscode");

const renumberableTypes = [
    constants.AlObjectTypes.XMLPort,
    constants.AlObjectTypes.codeUnit,
    constants.AlObjectTypes.page,
    constants.AlObjectTypes.query,
    constants.AlObjectTypes.report,
    constants.AlObjectTypes.table
]

exports.renumberAll = async function renumberAll() {
    let appFiles = await vscode.workspace.findFiles('**/app.json', undefined, 1);
    if (appFiles.length === 0) throw "No app.json found";
    if (appFiles.length > 1) throw "Multiple app.json files found: " + appFiles.toString();

    let appDocument = await vscode.workspace.openTextDocument(appFiles[0])
    let numberRanges = getNumberRanges(appDocument);

    return Promise.all(renumberableTypes.map(async objectType => {
        // Get all AL files for object type
        
        const files = await vscode.workspace.findFiles('**/' + alFileManagement.getFileFormatForType(objectType));
        // Get id foreach file
        const originalObjects = await Promise.all(files.map(file => mapFileToIdUriPair(file)));
        // Get new id to use foreach file
        const newIdMappings = createRenumberMapping(originalObjects, numberRanges);

        return Promise.all(newIdMappings.map(newIdMapping => renumberFile(newIdMapping.newId, newIdMapping.id, newIdMapping.path)));
    }));
}

/**
 * @param {{id: number, path: vscode.Uri}[]} originalObjects
 * @param {{from: number, to: number}[]} newNumberRanges
 * @returns {{id: number, newId: number, path: vscode.Uri}[]}
 */
function createRenumberMapping(originalObjects, newNumberRanges) {
    let newIdMapping = originalObjects
        .map((object) => Object.assign({newId: 0}, object))
        .sort((a, b) => a.id - b.id);
    
    let currentNumberRange = 0;
    let currentNo = newNumberRanges[currentNumberRange].from;
    let lastNo = newNumberRanges[currentNumberRange].to;

    newIdMapping.forEach(object => {
        object.newId = currentNo++;
        if (currentNo > lastNo) {
            ++currentNumberRange;
            if (currentNumberRange >= newNumberRanges.length)
                throw "Not enough numbers in new number range";
            currentNo = newNumberRanges[currentNumberRange].from;
            lastNo = newNumberRanges[currentNumberRange].to;
        } 
    });

    return newIdMapping;
}

//#region File manipulation
/**
 * @param {vscode.TextDocument} textDocument
 */
function getNumberRanges(textDocument) {
    const appJson = JSON.parse(textDocument.getText());
    return appJson.idRanges;
}

/**
 * @param {vscode.Uri} file
 */
async function mapFileToIdUriPair(file) {
    return {
        id: await getObjectId(file),
        path: file
    };
}

const objectIdRegex = /(?<=^\w+\s+)\d+/;
/**
 * @param {vscode.Uri} file
 * @returns {Thenable<number>}
 */
function getObjectId(file) {
    return vscode.workspace.openTextDocument(file).then(
        textDocument => {
            const text = textDocument.getText();
            const match = objectIdRegex.exec(text);
            if (match !== null) {
                return Number(match[0]);
            } else {
                return null;
            }
        }
    );
}

/**
 * @param {number} newNumber 
 * @param {number} oldNumber 
 * @param {vscode.Uri} file
 */
async function renumberFile(newNumber, oldNumber, file) {
    if (newNumber === oldNumber) return false;
    const textDocument = await vscode.workspace.openTextDocument(file);
    const text = textDocument.getText();
    const match = objectIdRegex.exec(text);
    if (match === null) return null;
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(file, textDocument.getWordRangeAtPosition(textDocument.positionAt(match.index)), newNumber.toString());

    return vscode.workspace.applyEdit(workspaceEdit)
        .then(result => textDocument.save()
        .then(() => result));
}
//#endregion