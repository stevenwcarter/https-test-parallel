# Parallel HTTPS testing

For privacy reasons, the config values and getItems.xml files are not included in this repository.

Create a config.json file like the following:

```
{
    "authHeader": "auth header value",
    "host": "host.com",
    "port": 443,
    "path": "/somepath"
}
```

Then create a getItems.xml file in the templates directory that contains the data for the post.
