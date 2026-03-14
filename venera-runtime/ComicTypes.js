class Comic {
    constructor({
        id,
        title,
        subtitle = '',
        cover = '',
        tags = [],
        description = '',
        language = 'Unknown'
    }) {
        this.id = id;
        this.title = title;
        this.subtitle = subtitle;
        this.cover = cover;
        this.tags = tags;
        this.description = description;
        this.language = language;
    }
}

class ComicDetails {
    constructor({
        id,
        title,
        subtitle = '',
        cover = '',
        tags = new Map(),
        description = '',
        uploadTime = '',
        isFavorite = false,
        thumbnails = [],
        related = [],
        url = '',
        subId = null,
        chapters = null,
        stars = 0,
        status = '',
        maxPage = null
    }) {
        this.id = id;
        this.title = title;
        this.subtitle = subtitle;
        this.cover = cover;
        this.tags = tags;
        this.description = description;
        this.uploadTime = uploadTime;
        this.isFavorite = isFavorite;
        this.thumbnails = thumbnails;
        this.related = related;
        this.url = url;
        this.subId = subId;
        this.chapters = chapters;
        this.stars = stars;
        this.status = status;
        this.maxPage = maxPage;
    }
}

class Comment {
    constructor({
        userName,
        avatar = '',
        content,
        time
    }) {
        this.userName = userName;
        this.avatar = avatar;
        this.content = content;
        this.time = time;
    }
}

class ComicSource {
    constructor() {
        this.name = '';
        this.key = '';
        this.version = '1.0.0';
        this.minAppVersion = '1.0.0';
        this.url = '';
        this.baseUrl = '';
        this.account = null;
        this.explore = [];
        this.category = null;
        this.categoryComics = null;
        this.search = null;
        this.favorites = null;
        this.comic = null;
        this.translation = {};
    }
}

module.exports = {
    Comic,
    ComicDetails,
    Comment,
    ComicSource
};
