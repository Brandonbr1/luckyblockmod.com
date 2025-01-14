import * as R from 'ramda';
import * as fs from 'fs';
import * as path from 'path';
import * as jsyaml from 'js-yaml';
import * as semver from 'semver';
import express from 'express';
import handlebars from 'express-handlebars';
import moment from 'moment';

const baseDir = path.join(__dirname, '..');
const clientDir = path.join(baseDir, '../client');
const docsDir = path.join(baseDir, '../docs');
const distDir = path.join(baseDir, '../../luckyblock-dist');

interface VersionMetaFile {
    readonly version: string;
    readonly version_number: number;
    readonly min_minecraft_version: string;
    readonly min_forge_version: string;
    readonly datetime: Date;
}

interface VersionMeta extends VersionMetaFile {
    readonly datetime_str: string;
    readonly min_minecraft_version: string;
}

type ProjectName = 'forge' | 'fabric' | 'template-addon-java' | 'template-addon-bedrock';

type VersionMap = {
    readonly [k: string]: VersionMeta;
};
type SortedVersions = {
    readonly [k in ProjectName]: ReadonlyArray<VersionMeta>;
};

interface VersionTemplateVars {
    readonly versionMap: VersionMap;
    readonly sortedVersions: SortedVersions;
}

const readDist = async (): Promise<VersionTemplateVars> => {
    const distFolders = await fs.promises.readdir(distDir).catch(() => {
        console.error(`${distDir} is empty`);
        return [];
    });

    const initMetas = await Promise.all(
        R.map(async (folderName) => {
            try {
                const metaStr = await fs.promises.readFile(
                    path.join(distDir, folderName, 'meta.yaml'),
                    'utf-8'
                );
                const metaFile = jsyaml.load(metaStr) as VersionMetaFile;
                const meta: VersionMeta = {
                    ...metaFile,
                    datetime_str: moment(metaFile.datetime).format('YYYY-MM-DD HH:mm'),
                };
                return [folderName, meta] as [string, VersionMeta];
            } catch (e) {
                console.error(e);
                return undefined;
            }
        }, distFolders)
    );
    const metas = R.filter((v) => v !== undefined, initMetas) as Array<[string, VersionMeta]>;

    const versionMap = R.fromPairs(metas);

    const getProjectName = (folderName: String): ProjectName => {
        if (folderName.startsWith('lucky-block-forge')) return 'forge';
        if (folderName.startsWith('lucky-block-fabric')) return 'fabric';
        if (folderName.startsWith('template-addon') && folderName.endsWith('java'))
            return 'template-addon-java';
        if (folderName.startsWith('template-addon') && folderName.endsWith('bedrock'))
            return 'template-addon-bedrock';
        return 'forge';
    };

    const versionsByProject = R.reduceBy(
        (acc, [_, meta]) => {
            acc.push(meta);
            return acc;
        },
        [] as Array<VersionMeta>,
        ([folderName]) => getProjectName(folderName),
        metas
    );
    const sortedVersions: SortedVersions = R.map(
        R.sortWith([(a, b) => semver.compare(b.version, a.version)]),
        versionsByProject
    );

    return { versionMap, sortedVersions };
};

const main = async () => {
    const app = express();
    const publicDomain = 'luckyblockmod.com';
    const port = 8080;

    app.set('views', [path.join(clientDir, 'dist/pages'), path.join(docsDir, 'dist')]);
    app.use(express.static(path.join(clientDir, 'dist')));

    // handlebars engines
    app.engine('html', handlebars({ extname: 'html' }));
    app.engine('txt', handlebars({ extname: 'txt' }));
    app.engine('md', handlebars({ extname: 'md' }));

    let templateData = {
        ...(await readDist()),
        layout: false,
    };

    // check for new versions every 5 minutes
    setInterval(async () => {
        templateData = { ...templateData, ...(await readDist()) };
    }, 1000 * 60 * 5);

    app.get('/', (_, res) => {
        res.render('index.html', templateData);
    });

    app.get('/version-log-forge', (_, res) => {
        res.render('version-log-forge.txt', templateData);
    });
    app.get('/version-log-fabric', (_, res) => {
        res.render('version-log-fabric.txt', templateData);
    });

    app.get('/info', (_, res) => {
        res.render('info.html', templateData);
    });
    app.get('/download', (_, res) => {
        res.render('download.html', templateData);
    });

    app.get('/download/forge-:version', (req, res) => {
        const meta = templateData.versionMap[`lucky-block-forge-${req.params['version']}`];
        res.render('download-forge.html', { ...templateData, meta });
    });
    app.get('/download/fabric-:version', (req, res) => {
        const meta = templateData.versionMap[`lucky-block-fabric-${req.params['version']}`];
        res.render('download-fabric.html', { ...templateData, meta });
    });

    app.get('/download/:version/download', (req, res) => {
        try {
            const version = req.params['version'];
            const host = req.get('host') || '';
            const referrerUrl = new URL(req.get('referrer') || '');

            // make sure that other sites don't link directly to the download
            if (referrerUrl.host !== host && !referrerUrl.host.includes(publicDomain))
                res.redirect('/');

            const file = path.join(distDir, `lucky-block-${version}`, `lucky-block-${version}.jar`);
            res.download(file);
        } catch {
            res.redirect('/');
        }
    });
    app.get('/instant-download/:name.:ext', (req, res) => {
        try {
            const name = req.params['name'];
            if (name.startsWith('luckyblock')) res.redirect('/');

            const file = path.join(distDir, name, `${name}.${req.params['ext']}`);
            res.download(file);
        } catch {
            res.redirect('/');
        }
    });

    app.get('/docs', (_, res) => {
        res.render('docs.html', templateData);
    });
    app.get('/docs/:path', (req, res) => {
        res.render(req.params['path'], templateData);
    });

    // compatibility
    app.get('/projects/lucky_block/download/version/version_log.txt', (_, res) => {
        res.redirect('/version-log-forge');
    });
    app.get('/version-log', (_, res) => {
        res.redirect('/version-log-forge');
    });
    app.get('/projects/*', (_, res) => {
        res.redirect('/');
    });

    app.listen(port, () => console.log(`App listening to port ${port}`));
};

main();
