-- Biniş noktalarını rota duraklarından ayırma göçü.
-- Mevcut DURAK kayıtları bugüne kadar biniş noktası olarak kullanıldığından
-- (fiyatlı, "Nereden bineceksiniz?" kaynağı) tümü BINIS'e çevrilir.
-- Yeni rota-yalnız duraklar admin panelden DURAK olarak eklenebilir.
UPDATE "TourPlace" SET "type" = 'BINIS' WHERE "type" = 'DURAK';
