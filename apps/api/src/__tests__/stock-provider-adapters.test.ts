jest.mock('../config/database',()=>({query:jest.fn(async()=>({rows:[],rowCount:0})),transaction:jest.fn()}));
jest.mock('../utils/safe-fetch',()=>({safeFetch:jest.fn(),validatePublicHttpUrl:jest.fn()}));

import { env } from '../config/env';
import { safeFetch } from '../utils/safe-fetch';
import { searchStock } from '../services/stock-media.service';

const fetchMock=safeFetch as jest.MockedFunction<typeof safeFetch>;
function fixture(data:unknown,status=200){return {url:'https://provider.example/result',status,ok:status>=200&&status<300,headers:new Headers({'content-type':'application/json'}),json:async()=>data,text:async()=>JSON.stringify(data),bytes:async()=>new Uint8Array()} as any;}

describe('multi-source stock adapter contracts',()=>{
  beforeEach(()=>{jest.clearAllMocks();Object.assign(env,{PEXELS_API_KEY:'pexels-test',PIXABAY_API_KEY:'pixabay-test',UNSPLASH_ACCESS_KEY:'unsplash-test',OPENVERSE_CLIENT_ID:'',OPENVERSE_CLIENT_SECRET:''});});
  test('Pexels maps photo and video fixtures with source attribution',async()=>{
    fetchMock.mockImplementation(async(url:any)=>String(url).includes('/videos/')?fixture({videos:[{id:2,url:'https://pexels.com/video/2',duration:9,width:1920,height:1080,image:'https://images/2.jpg',user:{name:'Video Author',url:'https://pexels.com/@video'},video_files:[{width:1920,height:1080,link:'https://videos/2.mp4'}]}]}):fixture({photos:[{id:1,url:'https://pexels.com/photo/1',width:1600,height:900,alt:'Horse',photographer:'Photo Author',photographer_url:'https://pexels.com/@photo',src:{medium:'https://images/1-small.jpg',large2x:'https://images/1.jpg'}}]}));
    const photo=await searchStock({providers:['pexels'],query:'horse',mediaType:'photo'});const video=await searchStock({providers:['pexels'],query:'horse',mediaType:'video'});
    expect(photo.results[0]).toMatchObject({provider:'pexels',mediaType:'photo',creatorName:'Photo Author',commercialUseAllowed:true});
    expect(video.results[0]).toMatchObject({provider:'pexels',mediaType:'video',duration:9,attributionRequired:true});
  });
  test('Pixabay maps photo and video fixtures with its content license',async()=>{
    fetchMock.mockImplementation(async(url:any)=>String(url).includes('/videos/')?fixture({hits:[{id:4,user:'Clip Author',user_id:8,pageURL:'https://pixabay.com/videos/4',duration:7,videos:{large:{width:1280,height:720,url:'https://cdn/4.mp4'}}}]}):fixture({hits:[{id:3,user:'Image Author',user_id:7,pageURL:'https://pixabay.com/photos/3',tags:'horse, stable',webformatURL:'https://cdn/3-preview.jpg',largeImageURL:'https://cdn/3.jpg',imageWidth:1600,imageHeight:1067}]}));
    const photo=await searchStock({providers:['pixabay'],query:'stable',mediaType:'photo'});const video=await searchStock({providers:['pixabay'],query:'stable',mediaType:'video'});
    expect(photo.results[0]).toMatchObject({provider:'pixabay',licenseIdentifier:'Pixabay-Content-License',creatorName:'Image Author'});
    expect(video.results[0]).toMatchObject({provider:'pixabay',mediaType:'video',duration:7});
  });
  test('Unsplash preserves hotlink and download tracking contracts',async()=>{
    fetchMock.mockResolvedValue(fixture({results:[{id:'u1',width:1400,height:900,alt_description:'Arena',urls:{small:'https://images.unsplash.com/small',regular:'https://images.unsplash.com/regular'},links:{html:'https://unsplash.com/photos/u1',download_location:'https://api.unsplash.com/photos/u1/download'},user:{name:'Unsplash Author',links:{html:'https://unsplash.com/@author'}}}]}));
    const result=await searchStock({providers:['unsplash'],query:'arena'});
    expect(result.results[0]).toMatchObject({provider:'unsplash',sourceFileUrl:'https://images.unsplash.com/regular',downloadTrackingUrl:'https://api.unsplash.com/photos/u1/download',attributionRequired:true});
  });
  test('Openverse anonymous mode filters unsafe licenses and keeps attribution',async()=>{
    fetchMock.mockResolvedValue(fixture({results:[{id:'o1',title:'Horse work',thumbnail:'https://openverse/thumb',url:'https://openverse/file.jpg',foreign_landing_url:'https://source/work',creator:'Open Author',creator_url:'https://source/author',width:1200,height:800,license:'by-sa',license_url:'https://creativecommons.org/licenses/by-sa/4.0/',attribution:'Horse work by Open Author'},{id:'o2',title:'Restricted',url:'https://openverse/restricted.jpg',license:'by-nc'}]}));
    const result=await searchStock({providers:['openverse'],query:'horse'});
    expect(result.results).toHaveLength(1);expect(result.results[0]).toMatchObject({provider:'openverse',licenseIdentifier:'by-sa',attributionText:'Horse work by Open Author'});
  });
  test('missing credentials and provider failures are truthful, non-fatal states',async()=>{
    (env as any).PEXELS_API_KEY='';
    expect((await searchStock({providers:['pexels'],query:'horse'})).providers[0].state).toBe('EXTERNAL_CONFIGURATION_REQUIRED');
    (env as any).PEXELS_API_KEY='configured';fetchMock.mockRejectedValue(new Error('offline'));
    expect((await searchStock({providers:['pexels'],query:'horse'})).providers[0].state).toBe('PROVIDER_UNAVAILABLE');
  });
});
