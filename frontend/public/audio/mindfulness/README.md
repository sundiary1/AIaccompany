# 正念音频资源

将获授权的 MP3 / M4A / OGG 等文件放在本目录，然后在
`frontend/src/components/Mindfulness/mindfulnessTracks.ts` 中添加条目。
本目录当前没有正式音频；不下载第三方音乐、不请求不存在的文件。

```ts
{
  id: "forest-01",
  title: "林间片刻",
  description: "填写音频的实际说明",
  category: "nature", // 或 guided
  src: `${import.meta.env.BASE_URL}audio/mindfulness/forest-01.mp3`,
}
```

只在文件实际存在、获授权后加入清单。播放器从真实媒体元数据读取时长，
切换音轨暂停上一首，新音轨需用户主动点击播放。不要填写猜测的时长。
