# API Contracts: Граф сущностей

Supabase автоматически генерирует REST API из таблиц.
Здесь документируются основные запросы, используемые фронтендом.

## Чтение

### GET nodes (каталог с фильтрацией)

```
supabase
  .from('nodes')
  .select('id, title, fields, type:node_types(slug, label, icon)')
  .eq('campaign_id', campaignId)
  .eq('type_id', typeId)          // опционально, для фильтрации
  .order('title')
```

Response shape:
```json
{
  "id": "uuid",
  "title": "Тайвен",
  "fields": {"description": "...", "status": "Выпускница"},
  "type": {"slug": "npc", "label": "НПС", "icon": "👤"}
}
```

### GET nodes (полнотекстовый поиск)

```
supabase
  .from('nodes')
  .select('id, title, fields, type:node_types(slug, label, icon)')
  .eq('campaign_id', campaignId)
  .textSearch('search_vector', query, {config: 'russian'})
```

### GET node by id (карточка с связями)

Два запроса параллельно:

```
// Нода
supabase
  .from('nodes')
  .select('id, title, fields, type:node_types(slug, label, icon)')
  .eq('id', nodeId)
  .single()

// Связи (исходящие + входящие)
supabase
  .from('edges')
  .select('id, type, label, source:nodes!source_id(id, title), target:nodes!target_id(id, title)')
  .or(`source_id.eq.${nodeId},target_id.eq.${nodeId}`)
```

Response shape для связей:
```json
{
  "id": "uuid",
  "type": "knows",
  "label": "подруга",
  "source": {"id": "uuid", "title": "Тайвен"},
  "target": {"id": "uuid", "title": "Дрипли"}
}
```

### GET node_types (для фильтров и формы создания)

```
supabase
  .from('node_types')
  .select('id, slug, label, icon, default_fields')
  .eq('campaign_id', campaignId)
  .order('sort_order')
```

## Запись

### POST node (создание)

```
supabase
  .from('nodes')
  .insert({
    campaign_id: campaignId,
    type_id: typeId,
    title: 'Горнокрабль',
    fields: {description: 'Волшебник, поднял таверну на пальце'}
  })
  .select()
  .single()
```

Валидация:
- `title` — не пустой, max 200 символов
- `type_id` — существующий тип в рамках кампании
- `fields` — валидный JSON, max 50KB
