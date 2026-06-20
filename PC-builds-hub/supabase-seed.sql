-- =====================================================================
-- PC Builds Hub — 初期データ投入（posts.json の 15 件）
-- ---------------------------------------------------------------------
-- 前提:
--   1) supabase-schema.sql を先に実行済みであること
--   2) 投稿の持ち主にする user が auth.users に存在すること
--      （= 一度サインアップしておく）
--
-- 使い方:
--   下の 'YOUR_LOGIN_EMAIL' を、自分がサインアップしたメールに置き換えて
--   Supabase の SQL Editor で実行してください。
--   ※ SQL Editor は管理権限で動くため RLS をバイパスして投入できます。
--   ※ メールが auth.users に無い場合は 0 行挿入（安全に何も起きません）。
--
-- posts.json → DB のキー対応:
--   comment→description / ram→memory / case→case_name / image→image_url /
--   benchTitle→bench_title / benchScore→bench_score / status は 'approved' 固定
-- =====================================================================

with seed_user as (
  select id from auth.users
  where email = 'YOUR_LOGIN_EMAIL'   -- ← 自分のメールに置き換える
  limit 1
)
insert into public.posts
  (user_id, title, description, cpu, gpu, motherboard, memory, storage, psu,
   case_name, cooler, budget, resolution, usage, tags, image_url,
   bench_title, bench_score, badge, status)
select su.id, v.*
from seed_user su,
(values
  ('静音×バランス 1440p構成','静音と性能のバランスを意識した、1440pゲーミングの定番構成です。','Ryzen 7 5700X3D','RTX 4070 SUPER','B550 Steel Legend','32GB DDR4-3200','1TB NVMe SSD','750W Gold','Corsair 4000D','AK400',null::integer,'1440p','ゲーム',array['AMD','Corsair','静音','バランス','空冷']::text[],'images/Test1.jpg','Cyberpunk 2077 (WQHD/高)',92::numeric,'編集部Pick','approved'),
  ('FHDコスパ エントリーゲーミング','10万円台前半を狙ったエントリー構成。FHDの競技系タイトルなら十分快適です。','Ryzen 5 5600','RTX 4060','B550M Pro4','16GB DDR4-3200','500GB NVMe SSD','550W Bronze','Thermaltake Versa H17','虎徹 MarkIII',null,'FHD','ゲーム',array['AMD','コスパ','FHD','ゲーミング','空冷'],'images/Test2.jpg','VALORANT (FHD/高)',240,'','approved'),
  ('WQHDバランス Intel構成','i5-13600K と RTX 4070 の王道WQHDバランス。DDR5でゲーム以外も快適。','Core i5-13600K','RTX 4070','Z790-P WIFI','32GB DDR5-5600','1TB NVMe SSD','750W Gold','Fractal Pop Air','AK620',null,'1440p','ゲーム',array['Intel','Fractal','バランス','DDR5','ゲーミング'],'images/Test3.jpg','Apex Legends (WQHD/高)',165,'注目','approved'),
  ('4K最速 フラッグシップ構成','妥協なしの4Kゲーミング。レイトレ最高設定でも余裕のフラッグシップ構成。','Ryzen 9 7950X3D','RTX 4090','X670E Taichi','64GB DDR5-6000','2TB NVMe SSD Gen5','1000W Platinum','Lian Li O11 Dynamic EVO','360mm水冷AIO',null,'4K','ゲーム',array['AMD','Lian Li','水冷','ハイエンド','4K','DDR5'],'images/Test4.jpeg','Cyberpunk 2077 (4K/ウルトラ)',110,'ハイエンド','approved'),
  ('ガラスケース映えRGB構成','ガラスパネル越しに見えるRGBが主役。見た目と性能を両立した映え構成。','Ryzen 7 7800X3D','RTX 4070 Ti SUPER','B650 Tomahawk WIFI','32GB DDR5-6000','1TB NVMe SSD','850W Gold','Lian Li O11','360mm水冷AIO RGB',null,'1440p','ゲーム',array['AMD','Lian Li','RGB','ガラスケース','映え','水冷'],'images/Test5.jpeg','Cyberpunk 2077 (WQHD/ウルトラ)',118,'','approved'),
  ('4Kクリエイター ハイエンド構成','4K動画編集、3DCG、すべてを高速にこなす制作向けハイエンド構成。','Ryzen 9 7950X','RTX 4080 SUPER','X670E Taichi','64GB DDR5-6000','2TB NVMe SSD Gen5','1000W Platinum','Fractal Torrent','360mm水冷AIO',null,'4K','クリエイティブ',array['AMD','Fractal','水冷','ハイエンド','クリエイター','4K'],'images/Test6.jpeg','DaVinci Resolve (書き出しスコア)',245,'ハイエンド','approved'),
  ('配信特化 デュアル用途構成','12コアでゲームと配信エンコードを同時にこなす配信特化構成。コマ落ちなし。','Ryzen 9 7900','RTX 4070 SUPER','B650 Pro RS','32GB DDR5-5600','2TB NVMe SSD','850W Gold','NZXT H7 Flow','240mm水冷AIO',null,'1440p','配信',array['AMD','NZXT','配信','バランス','水冷'],'images/Test1.jpg','OBS同時配信テスト (1080p60)',null,'注目','approved'),
  ('静音クリエイター 水冷構成','動画編集中でもファン音が気にならない超静音設計。長時間作業向け。','Core i9-13900K','RTX 4080 SUPER','Z790 Aorus Master','32GB DDR5-5600','2TB NVMe SSD','850W Platinum','be quiet! Silent Base 802','280mm水冷AIO',null,'1440p','クリエイティブ',array['Intel','be quiet!','水冷','静音','クリエイター'],'images/Test2.jpg','Premiere Pro (書き出しスコア)',180,'','approved'),
  ('白統一RGB デスク映え構成','全パーツを白で統一。デスク映えを最重視した光る白PC構成です。','Ryzen 7 7800X3D','RTX 4070 SUPER White Ed.','B650M Aero G White','32GB DDR5-6000 White','1TB NVMe SSD','750W Gold White','Lian Li O11 Air White','360mm白水冷AIO',null,'1440p','白PC・光るPC',array['AMD','Lian Li','白PC','RGB','水冷','映え'],'images/Test3.jpg','Cyberpunk 2077 (WQHD/高)',102,'編集部Pick','approved'),
  ('省スペース Mini-ITX構成','デスクに置きやすいMini-ITXサイズ。小さくてもFHDゲーミングは余裕です。','Ryzen 5 7600','RTX 4060 Ti','B650I Edge WIFI','32GB DDR5-5600','1TB NVMe SSD','650W SFX Gold','Cooler Master NR200P','AXP90 (薄型空冷)',null,'FHD','ゲーム',array['AMD','省スペース','コスパ','ゲーミング','空冷'],'images/Test4.jpeg','Apex Legends (FHD/高)',180,'','approved'),
  ('中古活用 コスパ再生構成','中古GPUと流用パーツでコストを圧縮。FHDなら現役で戦える再生構成。','Ryzen 5 5600','RTX 3070 (中古)','B450 Steel Legend','16GB DDR4-3200','500GB NVMe SSD + 1TB HDD','650W Bronze (流用)','流用ミドルタワー','虎徹 MarkII',null,'FHD','ゲーム',array['AMD','中古活用','コスパ','FHD','ゲーミング'],'images/Test5.jpeg','Cyberpunk 2077 (FHD/高)',95,'','approved'),
  ('FHD配信 コスパ静音構成','FHD配信に特化したコスパ重視の静音構成。発熱とファン音を抑えています。','Ryzen 7 5700X','RTX 4060 Ti','B550 Steel Legend','32GB DDR4-3200','1TB NVMe SSD','650W Gold','Fractal Define 7','AK620',null,'FHD','配信',array['AMD','Fractal','静音','コスパ','配信','空冷'],'images/Test6.jpeg','OBS同時配信テスト (1080p60)',null,'編集部Pick','approved'),
  ('Intel白PC 光るバランス構成','白でまとめたIntel構成。清潔感のある光る白PCに仕上げました。','Core i5-14600K','RTX 4070 SUPER White Ed.','Z790-A WIFI White','32GB DDR5-6000 White','1TB NVMe SSD','750W Gold White','NZXT H7 Flow White','NZXT Kraken 240 White',null,'1440p','白PC・光るPC',array['Intel','NZXT','白PC','RGB','DDR5','映え'],'images/Test1.jpg','Cyberpunk 2077 (WQHD/高)',105,'注目','approved'),
  ('配信×制作 両立ハイエンド','高解像度配信と動画制作を1台で両立。24コアで重い同時作業もこなします。','Core i9-14900K','RTX 4080 SUPER','Z790 Aorus Elite','64GB DDR5-6000','2TB NVMe SSD Gen5','1000W Platinum','Corsair 5000D Airflow','360mm水冷AIO',null,'4K','配信',array['Intel','Corsair','配信','クリエイター','ハイエンド','水冷'],'images/Test2.jpg','Premiere Pro (書き出しスコア)',195,'','approved'),
  ('4K入門 ゲーミング構成','4Kゲーミングの入り口に。アップスケーリング併用で快適に遊べる構成です。','Ryzen 7 7800X3D','RTX 4070 Ti SUPER','B650 Tomahawk WIFI','32GB DDR5-6000','2TB NVMe SSD','850W Gold','NZXT H9 Elite','NZXT Kraken 360',null,'4K','ゲーム',array['AMD','NZXT','水冷','4K','ゲーミング'],'images/Test3.jpg','Cyberpunk 2077 (4K/高+DLSS)',90,'人気','approved')
) as v(title, description, cpu, gpu, motherboard, memory, storage, psu,
       case_name, cooler, budget, resolution, usage, tags, image_url,
       bench_title, bench_score, badge, status);

-- 確認:
--   select count(*) from public.posts where status = 'approved';
--   → 15 になっていれば成功です。
