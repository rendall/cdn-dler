const R = require('ramda');
const fs = require('fs');

const openHtmlFile = (file: string):Promise => new Promise((resolve: any, reject: any) => {
    const onResponse = (err, data) => err ? onError(err) : onSuccess(data);
    const onError = (error: any) => reject(error);
    const onSuccess = (data: string) => resolve(data);

    try {
        fs.readFile(file, 'utf8', onResponse);

    } catch (error) {
        onError(error);
    }
});

const scriptPtrn = /<script.*?src=["']((?:https?:\/\/)?[a-z0-9\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\/\.\?=0-9\&_]*)?)["']/

const getTag = (html:string) => {
    const pattern = RegExp(scriptPtrn);
    const exec = pattern.exec(html);
    console.log(tag);
}

const parseFile = (file:string) => openHtmlFile(file).then((data) => getTag(data)).catch((e: any) => console.error(e));

exports.parseFile = parseFile;
require('make-runnable');
