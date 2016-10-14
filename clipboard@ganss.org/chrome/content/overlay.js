var clipboardAttachment = (function () {
    var { classes: Cc, interfaces: Ci, utils: Cu } = Components;

    Cu.import('resource://gre/modules/Services.jsm');
    Cu.import("resource://gre/modules/NetUtil.jsm");

    function getPasteImageType() {
        var prefs = Cc["@mozilla.org/preferences-service;1"]
            .getService(Ci.nsIPrefService)
            .getBranch("clipboard.");
        var value = prefs.getIntPref("paste_image_type");

        return value;
    }

    function getOrderedFlavors() {
        var flavors = [];
        
        switch (getPasteImageType()) {
            case 0:
                flavors.push("image/jpeg");
                flavors.push("image/jpg");
                flavors.push("image/png");
                flavors.push("image/gif");
                break;
            case 1:
            default:
                flavors.push("image/png");
                flavors.push("image/jpeg");
                flavors.push("image/jpg");
                flavors.push("image/gif");
                break;
            case 2:
                flavors.push("image/gif");
                flavors.push("image/jpeg");
                flavors.push("image/jpg");
                flavors.push("image/png");
                break;
        }

        flavors.push("application/x-moz-file");
        flavors.push("text/x-moz-url");
        flavors.push("text/html");
        flavors.push("text/unicode");

        return flavors;
    }

    function getDataFromClipboard() {
        var trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);

        trans.init(null);
        var flavors = getOrderedFlavors();
        for (i = 0; i < flavors.length; i++) {
            trans.addDataFlavor(flavors[i]);
        }

        Services.clipboard.getData(trans, Services.clipboard.kGlobalClipboard);

        var flavor = {};
        var data = {};
        var len = {};

        trans.getAnyTransferData(flavor, data, len);

        return { flavor: flavor.value, data: data.value, length: len.value }; 
    }

    function createFile(name) {
        var file = FileUtils.getFile("TmpD", [name]);
        file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
        return file;
    }

    function writeString(data, name, callback) {
        var file = createFile(name);
        var ostream = FileUtils.openSafeFileOutputStream(file);
        var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
        converter.charset = "UTF-8";
        var istream = converter.convertToInputStream(data);

        NetUtil.asyncCopy(istream, ostream, function () {
            callback(file);
        });
    }

    function showException(ex) {
        var stringBundle = document.getElementById("stringBundle");
        var promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
        var title = stringBundle.getString("errorTitle");
        var msg = stringBundle.getString("errorMessage") + ": " + ex;
        promptService.alert(window, title, msg);
    }

    function addFileAttachment(file) {
        try {
            var attachment = FileToAttachment(file);
            AddAttachments([attachment]);
            createdFiles.push(file);
        } catch (ex) {
            showException(ex);
        }
    }

    var createdFiles = [];

    var my = {
        canAttach: function () {
            var clipboard = Services.clipboard;
            var flavors = getOrderedFlavors();
            var hasFlavors = clipboard.hasDataMatchingFlavors(flavors, flavors.length, clipboard.kGlobalClipboard);
            return hasFlavors;            
        },
        attachFromClipboard: function () {
            try {
                if (my.canAttach()) {
                    var data = getDataFromClipboard();

                    if (data.flavor.indexOf("image/") === 0) {
                        var extension = data.flavor === "image/png" ? "png" : (data.flavor === "image/gif" ? "gif" : "jpg");
                        var file = createFile("image." + extension);
                        var output = FileUtils.openSafeFileOutputStream(file);
                        NetUtil.asyncCopy(data.data, output, function () {
                            addFileAttachment(file);
                        });
                    } else if (data.flavor === "text/html") {
                        var html = data.data.QueryInterface(Ci.nsISupportsString).data;
                        writeString(data.data, "document.html", function (file) {
                            addFileAttachment(file);
                        });
                    } else if (data.flavor === "text/x-moz-url") {
                        var text = data.data.QueryInterface(Ci.nsISupportsString).data;
                        var lines = text.split('\n');
                        var attachment = Cc["@mozilla.org/messengercompose/attachment;1"].createInstance(Ci.nsIMsgAttachment);
                        attachment.url = lines[0];
                        if (lines.length > 1) attachment.name = lines[1];
                        if (lines.length > 2) attachment.size = lines[2];
                        AddAttachments([attachment]);
                    } else if (data.flavor === "text/unicode" || data.flavor === "text/plain") {
                        var text = data.data.QueryInterface(Ci.nsISupportsString).data;
                        writeString(data.data, "document.txt", function (file) {
                            addFileAttachment(file);
                        });
                    } else if (data.flavor === "application/x-moz-file") {
                        var file = data.data.QueryInterface(Ci.nsIFile);
                        var attachment = FileToAttachment(file);
                        AddAttachments([attachment]);
                    }
                }
            } catch (ex) {
                showException(ex);
            }    
        },
        updateCommand: function () {
            var canAttach = my.canAttach();
            goSetCommandEnabled("attachFromClipboardCmd", canAttach);
        }
    };

    function unload() {
        for (i = 0; i < createdFiles.length; i++) {
            createdFiles[i].remove(false);
        }
        createdFiles = [];
    }

    window.addEventListener("load", function () {
        var menuEditPopup = document.getElementById("menu_EditPopup");
        menuEditPopup.addEventListener("popupshowing", my.updateCommand);
        
        var msgComposeWindow = document.getElementById("msgcomposeWindow");
        msgComposeWindow.addEventListener("compose-window-close", unload);
        msgComposeWindow.addEventListener("compose-window-unload", unload);
    });
    window.addEventListener("unload", unload);

    return my;
} ());