/**
 * The default ("core") tool set: one endpoint per task, with a hand-written
 * description.
 *
 * HikerAPI exposes 100+ GET endpoints, most of them version variants of the
 * same call (v1 / v2 / gql / g2). Handing all of them to an agent makes tool
 * selection unreliable, so by default only the endpoints listed here become
 * tools. `HIKERAPI_TOOLS=all` restores the full generated list.
 *
 * Keys are OpenAPI paths. A path that is missing from the live spec, or that
 * the spec marks deprecated / Legacy, is simply not generated. Descriptions
 * state purpose, when to prefer a sibling tool, pagination and billing; they
 * never list response fields, because the spec does not define them.
 */

const LIVE = "Live request to Instagram, billed per call.";

export const CORE_TOOLS: Record<string, string> = {
  // ---------------------------------------------------------------- profiles
  "/v2/user/by/username":
    "Get an Instagram profile by username (without @). Use it when you have a handle; " +
    "use `get_v2_user_by_id` when you already know the numeric user id (faster), and " +
    "`get_gql_user_about` for the \"About this account\" panel. Returns the user object; " +
    "pass its `pk` as the user id to the other user tools. " +
    "Live request to Instagram, one billed request per call.",
  "/v2/user/by/id":
    "Get an Instagram profile by numeric user id. Use it when you already have the id " +
    "from another tool; use `get_v2_user_by_username` when you only have a handle. " +
    `Returns the same user object. ${LIVE}`,
  "/gql/user/about":
    "Get the \"About this account\" panel for an Instagram user id: verified status, " +
    "country of registration, account creation date and former usernames. Use it for " +
    "account provenance checks; use `get_v2_user_by_id` for the regular profile. " +
    LIVE,
  "/gql/user/medias":
    "List an Instagram user's posts, one page per call. Use it to read an account's " +
    "feed; use `get_v2_user_clips` for reels only and `get_v2_user_tag_medias` for posts " +
    "the user is tagged in. Pass `user_id`; for the next page pass the cursor from the " +
    "previous response as `profile_grid_items_cursor`. `flat=true` flattens nested media " +
    `objects into a single list. ${LIVE}`,
  "/v2/user/clips":
    "List an Instagram user's reels (short videos), one page per call. Use it for reels " +
    "only; use `get_gql_user_medias` for all posts. Pass `user_id`; for the next page " +
    `pass \`next_page_id\` from the previous response as \`page_id\`. ${LIVE}`,
  "/g2/user/followers":
    "List accounts that follow an Instagram user, one page per call. Use it to page " +
    "through the follower list; use `get_v1_user_search_followers` to look for specific " +
    "names among them and `get_g2_user_following` for accounts the user follows. Pass " +
    "`user_id`; for the next page pass the cursor from the previous response as " +
    "`page_id`. Live request to Instagram, one billed request per page.",
  "/g2/user/following":
    "List accounts an Instagram user follows, one page per call. Use it to page through " +
    "the following list; use `get_v1_user_search_following` to look for specific names in " +
    "it and `get_g2_user_followers` for the user's followers. Pass `user_id`; for the " +
    "next page pass the cursor from the previous response as `page_id`. " +
    "Live request to Instagram, one billed request per page.",
  "/v1/user/search/followers":
    "Search within an Instagram user's followers by name or username. Use it to check " +
    "whether specific accounts follow a user; use `get_g2_user_followers` to list all " +
    "followers. Pass `user_id` and `query`; `force=true` skips the account privacy " +
    `check. ${LIVE}`,
  "/v1/user/search/following":
    "Search within the accounts an Instagram user follows by name or username. Use it " +
    "to check whether a user follows specific accounts; use `get_g2_user_following` to " +
    "list all of them. Pass `user_id` and `query`; `force=true` skips the account " +
    `privacy check. ${LIVE}`,
  "/v2/user/stories":
    "Get an Instagram user's active stories by user id. Use it when you have the id; " +
    "use `get_v2_user_stories_by_username` when you only have a handle and " +
    "`get_v2_user_highlights` for saved highlight collections. `force=true` skips the " +
    "account privacy check. Live request to Instagram, billed as 2 requests per call.",
  "/v2/user/stories/by/username":
    "Get an Instagram user's active stories by username. Use it only when you have a " +
    "handle and not the user id: it is slower than `get_v2_user_stories` and billed as " +
    "3 requests per call instead of 2. Live request to Instagram.",
  "/v2/user/highlights":
    "List an Instagram user's story highlights (saved story collections) by user id, " +
    "one page per call. Use `get_v2_highlight_by_id` to open one highlight and " +
    "`get_v2_user_highlights_by_username` when you only have a handle. For the next " +
    "page pass `next_page_id` from the previous response as `page_id` (`amount` is " +
    "ignored). Live request to Instagram, billed as 2 requests per call.",
  "/v2/user/highlights/by/username":
    "List an Instagram user's story highlights by username, one page per call. Use it " +
    "only when you have a handle and not the user id: it is slower than " +
    "`get_v2_user_highlights` and billed as 3 requests per call instead of 2. For the " +
    "next page pass `next_page_id` from the previous response as `page_id`. " +
    "Live request to Instagram.",
  "/v2/user/tag/medias":
    "List posts in which an Instagram user is tagged, one page per call. Use it to see " +
    "who features an account; use `get_gql_user_medias` for the user's own posts. Pass " +
    "`user_id`; for the next page pass `next_page_id` from the previous response as " +
    `\`page_id\`. ${LIVE}`,
  "/gql/user/reposts":
    "List content an Instagram user has reposted, one page per call. Use " +
    "`get_gql_user_medias` for the user's own posts. Pass `user_id`; for the next page " +
    "pass the cursor from the previous response as `repost_next_max_id`. `flat=true` " +
    `returns a simple items list. ${LIVE}`,
  "/v2/user/suggested/profiles":
    "Get the accounts Instagram suggests as related to a given user. Use it to find " +
    "similar accounts; use `get_v2_fbsearch_accounts` to search accounts by keyword " +
    "instead. Pass `user_id`; `expand_suggestion=true` returns more detail per account. " +
    LIVE,

  // ------------------------------------------------------------------- posts
  "/v2/media/info/by/code":
    "Get an Instagram post or reel by its shortcode (the part after /p/ or /reel/ in " +
    "the link). Use `get_v2_media_info_by_url` when you have a full link and " +
    "`get_v2_media_info_by_id` for a numeric media id. Returns the media object, or 404 " +
    "for deleted or unavailable posts; promoted (ad) posts may also return 404. User " +
    `tags are not included for videos, use \`get_gql_media_usertags\` for those. ${LIVE}`,
  "/v2/media/info/by/id":
    "Get an Instagram post or reel by numeric media id. Use `get_v2_media_info_by_code` " +
    "for a shortcode and `get_v2_media_info_by_url` for a full link. Returns the media " +
    "object, or 404 for deleted or unavailable posts; promoted (ad) posts may also " +
    "return 404. User tags are not included for videos, use `get_gql_media_usertags` " +
    `for those. ${LIVE}`,
  "/v2/media/info/by/url":
    "Get an Instagram post or reel by its link (instagram.com/p/... or /reel/...). Use " +
    "`get_v2_media_info_by_code` for a bare shortcode. Returns the media object, 404 " +
    "for deleted or unavailable posts and 400 for links that are not posts: use " +
    "`get_v2_story_by_url` for story links and `get_v1_share_by_url` for /s/ share " +
    `links. Promoted (ad) posts may also return 404. ${LIVE}`,
  "/v2/media/comments":
    "Get comments on an Instagram post, about 15 per call. Pass the media `id`; for the " +
    "next page pass the page id from the previous response as `page_id`. Use " +
    "`get_v2_media_comments_replies` for replies under one comment and " +
    "`get_v2_media_likers` for users who liked the post. " +
    "Live request to Instagram, one billed request per page.",
  "/v2/media/comments/replies":
    "Get replies under one comment of an Instagram post. Use it to read a thread; use " +
    "`get_v2_media_comments` for the top-level comments. Pass `media_id` and " +
    "`comment_id` (both from the comments tool); paginate with `min_id` from the " +
    `previous response. ${LIVE}`,
  "/v2/media/likers":
    "Get users who liked an Instagram post, by media `id`. Use " +
    "`get_gql_comment_likers_chunk` for likers of a single comment and " +
    `\`get_v2_media_comments\` for commenters. ${LIVE}`,
  "/gql/media/usertags":
    "Get the users tagged in Instagram videos; pass up to 10 media ids in `media_ids`. " +
    "Use it for reels and videos, because the `get_v2_media_info_*` tools do not return " +
    `user tags for video. ${LIVE}`,
  "/gql/comment/likers/chunk":
    "Get users who liked one comment on an Instagram post, one page per call. Pass " +
    "`comment_id` and `media_id`; paginate with `end_cursor` from the previous response. " +
    `Use \`get_v2_media_likers\` for likers of the post itself. ${LIVE}`,

  // ------------------------------------------------------------------ search
  "/v2/fbsearch/topsearch":
    "Search Instagram for top content by keyword. Use it for a broad first look; use " +
    "`get_v2_fbsearch_accounts` to search only accounts, `get_v2_fbsearch_reels` only " +
    "reels and `get_v1_search_hashtags` only hashtags. Paginate with `next_max_id` from " +
    `the previous response. ${LIVE}`,
  "/v2/fbsearch/accounts":
    "Search Instagram accounts by keyword. Use it to find a profile when you do not " +
    "know the exact handle; use `get_v2_user_by_username` for an exact handle. Paginate " +
    `with \`page_token\` from the previous response. ${LIVE}`,
  "/v2/fbsearch/reels":
    "Search Instagram reels by keyword. Use it to find short videos about a topic; use " +
    "`get_v1_hashtag_medias_clips_chunk` for reels under one specific hashtag. Paginate " +
    `with \`reels_max_id\` and \`rank_token\` from the previous response. ${LIVE}`,
  "/v1/search/hashtags":
    "Search Instagram hashtags by keyword. Use it when unsure of the exact tag; use " +
    `\`get_v1_hashtag_by_name\` for one known hashtag. ${LIVE}`,
  "/v1/search/music":
    "Search Instagram music tracks by keyword (song or artist). Use " +
    `\`get_v2_track_by_id\` for one known track. ${LIVE}`,
  "/v1/fbsearch/places":
    "Search Instagram places by name (`query`), optionally with `lat` and `lng`. Use " +
    "it to find a location id for `get_g2_location_by_id` and the location media tools; " +
    `use \`get_v1_location_search\` when you only have coordinates. ${LIVE}`,
  "/v1/location/search":
    "Find Instagram locations at a coordinate: pass `lat` and `lng`. Use " +
    `\`get_v1_fbsearch_places\` to search places by name instead. ${LIVE}`,

  // ---------------------------------------------------------------- hashtags
  "/v1/hashtag/by/name":
    "Get an Instagram hashtag by exact name (no # and no special characters). Use it " +
    "for the hashtag's own info; use `get_v2_hashtag_medias_top` or " +
    "`get_v2_hashtag_medias_recent` for its posts and `get_v1_search_hashtags` when " +
    `unsure of the exact tag. ${LIVE}`,
  "/v2/hashtag/medias/recent":
    "List recent posts under an Instagram hashtag, one page per call. Use " +
    "`get_v2_hashtag_medias_top` for top posts and `get_v1_hashtag_medias_clips_chunk` " +
    "for reels only. Pass `name` without #; for the next page pass `next_page_id` from " +
    `the previous response as \`page_id\`. ${LIVE}`,
  "/v2/hashtag/medias/top":
    "List top posts under an Instagram hashtag, one page per call. Use " +
    "`get_v2_hashtag_medias_recent` for the newest posts and " +
    "`get_v1_hashtag_medias_clips_chunk` for reels only. Pass `name` without #; for the " +
    `next page pass \`next_page_id\` from the previous response as \`page_id\`. ${LIVE}`,
  "/v1/hashtag/medias/clips/chunk":
    "List reels under an Instagram hashtag, one page per call. Use " +
    "`get_v2_hashtag_medias_top` or `get_v2_hashtag_medias_recent` for all post types " +
    "and `get_v2_fbsearch_reels` to search reels by free text. Pass `name` without #; " +
    `paginate with \`max_id\` from the previous response. ${LIVE}`,

  // --------------------------------------------------------------- locations
  "/g2/location/by/id":
    "Get an Instagram location by id: name, latitude/longitude, category and " +
    "description. Use `get_v1_fbsearch_places` or `get_v1_location_search` to find the " +
    `id first, and the location media tools for posts made there. ${LIVE}`,
  "/v1/location/medias/recent/chunk":
    "List recent posts made at an Instagram location, one page per call. Pass " +
    "`location_pk`; paginate with `max_id` from the previous response. Use " +
    `\`get_v1_location_medias_top_chunk\` for top posts. ${LIVE}`,
  "/v1/location/medias/top/chunk":
    "List top posts made at an Instagram location, one page per call. Pass " +
    "`location_pk`; paginate with `max_id` from the previous response. Use " +
    `\`get_v1_location_medias_recent_chunk\` for the newest posts. ${LIVE}`,

  // ------------------------------------------------ stories, highlights, links
  "/v2/story/by/id":
    "Get one Instagram story by its id. Use `get_v2_story_by_url` when you have a story " +
    `link and \`get_v2_user_stories\` to list a user's active stories. ${LIVE}`,
  "/v2/story/by/url":
    "Get one Instagram story by its link. For share links that contain /s/, call " +
    "`get_v1_share_by_url` first to resolve them. Use `get_v2_story_by_id` when you " +
    `have the id. ${LIVE}`,
  "/v2/highlight/by/id":
    "Get one Instagram story highlight by id. Use `get_v2_user_highlights` to list a " +
    `user's highlights and \`get_v1_highlight_by_url\` when you have a link. ${LIVE}`,
  "/v1/highlight/by/url":
    "Get one Instagram story highlight by its link. For share links that contain /s/, " +
    "call `get_v1_share_by_url` first to resolve them. Use `get_v2_highlight_by_id` " +
    `when you have the id. ${LIVE}`,
  "/v1/share/by/url":
    "Resolve an Instagram share link (a URL that contains /s/) to the object it points " +
    "to: returns its id (`pk`) and `type`. Works for stories and highlights only; then " +
    "call `get_v2_story_by_id` or `get_v2_highlight_by_id` with the id. For post links " +
    `use \`get_v2_media_info_by_url\`. ${LIVE}`,

  // ------------------------------------------------------------------- audio
  "/v2/track/by/id":
    "Get an Instagram music track by `track_id`. Use `get_v1_search_music` to find " +
    "tracks by keyword. For the next page pass `next_page_id` from the previous " +
    `response as \`page_id\`. ${LIVE}`,
};

export const CORE_PATHS: ReadonlySet<string> = new Set(Object.keys(CORE_TOOLS));
