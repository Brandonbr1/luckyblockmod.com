import * as R from 'ramda';
import * as Handlebars from 'handlebars';
import * as glob from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const publicFolder = 'public';

const globAsync = promisify(glob);

const registerPartials = async () => {
    const filePaths = await globAsync('src/partials/**/*.html');
    for await (const filePath of filePaths) {
        const contents = await fs.promises.readFile(filePath, 'utf-8');
        Handlebars.registerPartial(path.basename(filePath, path.extname(filePath)), contents);
    }
};

const generatePages = async () => {
    const filePaths = await globAsync('src/pages/**/*.html');
    for await (const filePath of filePaths) {
        const contents = await fs.promises.readFile(filePath, 'utf-8');
        const template = Handlebars.compile(contents);

        const publicPath = path.join(publicFolder, path.relative('src/pages', filePath));
        await fs.promises.mkdir(path.dirname(publicPath), { recursive: true });
        await fs.promises.writeFile(publicPath, template({}));
    }
};

const copyStatic = async () => {
    const filePaths = await globAsync('src/static/**/*.*');
    for await (const filePath of filePaths) {
        const publicPath = path.join(publicFolder, path.relative('src/static', filePath));
        await fs.promises.mkdir(path.dirname(publicPath), { recursive: true });
        await fs.promises.copyFile(filePath, publicPath);
    }
};

const main = async () => {
    await registerPartials();
    await generatePages();
    await copyStatic();
    const template = Handlebars.compile('hello {{> navbar }}');
    //console.log(template({ foo: 'test' }));
};

main();
