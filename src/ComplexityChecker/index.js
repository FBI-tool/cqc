const fs = require('fs');
const path = require('path');

const _ = require('lodash');
const Linter = require('eslint').Linter;
const SourceCode = require('eslint').SourceCode;

const getParserFromFilepath = require('./getParserFromFilepath');
const BaseChecker = require('../BaseChecker');
const eslintConfig = require('./eslintConfig');
const CheckerResult = require('../CheckerResult');

const linter = new Linter();

const COMPLEXITY = /complexity of (\d*)./;

class ComplexityChecker extends BaseChecker {
    check(...args) {
        super.check(...args);

        let numberOfFunctions = 0;
        let numberOfHighComplexityFunctions = 0;
        let max = 0;

        const details = this.fileList.map((filepath) => {
            return this.getEslintResultFromFilepath(filepath);
        }).filter((eslintResult) => {
            numberOfFunctions += eslintResult.numberOfFunctions;
            numberOfHighComplexityFunctions += eslintResult.numberOfHighComplexityFunctions;
            max = Math.max(max, eslintResult.complexity);
            if (eslintResult.complexity > this.options.complexityMax) {
                return true;
            }
            return false;
        });

        let percentage = 0;
        if (numberOfFunctions > 0) {
            percentage = numberOfHighComplexityFunctions / numberOfFunctions * 100;
        }
        percentage = percentage.toFixed(2);

        const result = {
            complexity: {
                percentage,
                details,
                numberOfFunctions,
                numberOfHighComplexityFunctions
            }
        };

        if (this.options.filterPattern) {
            const filterDetails = result.complexity.details.filter(({ filepath }) => {
                for (let i = 0; i < this.filterFileList.length; i++) {
                    if (this.filterFileList[i] === filepath) {
                        return true;
                    }
                }
                return false;
            });

            result.complexity.filterDetails = filterDetails;
        }

        return new CheckerResult(result, this.options);
    }
    getEslintResultFromFilepath(filepath) {
        const extname = path.extname(filepath).slice(1);
        const resolvedFilepath = path.resolve(filepath);
        if (extname !== 'js' && extname !== 'jsx' && extname !== 'vue') {
            return {
                filepath: resolvedFilepath,
                complexity: 0,
                details: [],
                numberOfFunctions: 0,
                numberOfHighComplexityFunctions: 0
            };
        }

        const fileContent = fs.readFileSync(filepath, 'utf-8');
        const parser = getParserFromFilepath(filepath);
        const ast = parser.parse(fileContent, eslintConfig.parserOptions);
        const code = new SourceCode(fileContent, ast);
        const eslintResult = linter.verify(code, eslintConfig, {
            filename: resolvedFilepath,
            allowInlineConfig: false
        });

        let maxComplexity = 0;
        const eslintResultWithComplexity = eslintResult.map((oneResult) => {
            const { message } = oneResult;
            const complexity = this.getComplexityFromMessage(message);
            maxComplexity = Math.max(maxComplexity, complexity);
            return _.merge({ complexity }, oneResult);
        }).filter(({ complexity }) => {
            return complexity > this.options.complexityMax;
        });

        return {
            filepath: resolvedFilepath,
            complexity: maxComplexity,
            details: eslintResultWithComplexity,
            numberOfFunctions: eslintResult.length,
            numberOfHighComplexityFunctions: eslintResultWithComplexity.length
        };
    }
    getComplexityFromMessage(message) {
        const regExpResult = COMPLEXITY.exec(message);
        if (regExpResult && typeof regExpResult[1] === 'string') {
            return Number(regExpResult[1]);
        }
        return 0;
    }
}

module.exports = ComplexityChecker;
