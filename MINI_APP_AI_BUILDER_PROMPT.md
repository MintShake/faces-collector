# Faces Fix Prompt: Individual FID Timeline Pages

You are fixing one specific issue in the Faces / Farfaces Mini App frontend.

Do not rebuild the app. Do not change the collector. Do not change storage. Do not add a new database. Do not change the public API contract.

## The Problem

The Browse page is working, but individual FID/profile pages are only showing the latest PFP instead of the full PFP timeline.

This usually happens when the individual profile page is built from the Browse/list API response.

That is incorrect.

The Browse/list endpoint intentionally returns only preview images per FID so Browse stays fast.

Example Browse request:

```txt
GET https://web-legoblocksapps.vercel.app/api/faces?limit=24&offset=0&imagesPerFid=1&sort=count&order=desc
```

If `imagesPerFid=1`, the response only includes one preview image for each FID. That is expected behavior for Browse cards.

Do not use that response as the data source for an individual FID/profile page.

## Correct Fix

For an individual FID/profile page inside the timeline stack, fetch the full timeline for that exact FID.

Use:

```txt
GET https://web-legoblocksapps.vercel.app/api/faces/{fid}
```

Example:

```txt
GET https://web-legoblocksapps.vercel.app/api/faces/389456
```

This should be the main data source for the individual profile page. It returns profile data plus the saved PFP timeline for that FID.

If the page only needs image timeline data, use:

```txt
GET https://web-legoblocksapps.vercel.app/api/faces/{fid}/images?limit=50&offset=0
```

Example:

```txt
GET https://web-legoblocksapps.vercel.app/api/faces/389456/images?limit=50&offset=0
```

Render every returned PFP for that FID, newest first.

If the images endpoint returns a full page and there may be more images, continue paging:

```txt
GET /api/faces/{fid}/images?limit=50&offset=50
GET /api/faces/{fid}/images?limit=50&offset=100
```

## Expected Behavior

Browse page:

- uses `GET /api/faces`
- shows preview cards
- may use `imagesPerFid=1`
- does not show the full timeline for each FID

Individual FID/profile page:

- route like `/fid/{fid}` or the app's equivalent timeline stack screen
- uses `GET /api/faces/{fid}` or `GET /api/faces/{fid}/images`
- shows all saved PFPs for that FID
- does not rely on Browse preview data
- displays the timeline newest first
- uses the returned image URLs as-is

## Important

The returned image URLs already point to the safe Faces Vercel image proxy.

Do not replace them with raw Tigris URLs.

Do not fetch directly from Tigris.

Do not ask for Tigris credentials.

Do not add Neynar for this fix.

## Verification

After the fix, test with an FID known to have multiple saved PFPs.

The individual profile page should show more than one PFP when the API returns more than one image.

Also verify Browse still works exactly as before.
