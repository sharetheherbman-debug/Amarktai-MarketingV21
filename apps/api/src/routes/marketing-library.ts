import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ApiResponse } from '../types';
import type { AuthRequest } from '../middleware/auth';
import { requireOrganizationRole } from '../middleware/organization-access';
import * as library from '../services/marketing-library.service';
import { getStockProviderStates, searchStock, saveStockReference, verifyStockSaveToken } from '../services/stock-media.service';
import { startBrandBootstrap, getBrandBootstrap, acceptBrandBootstrap } from '../services/brand-bootstrap.service';

const router = Router();
const owners = requireOrganizationRole('owner','admin');
const organizationId = (req: AuthRequest) => String(req.organizationId || '');
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => schema.parse(value);

const itemSchema = z.object({
  item_key:z.string().max(255).optional(),kind:z.string().min(1),category:z.string().min(1).max(100),name:z.string().min(1).max(255),description:z.string().max(5000).optional(),
  tags:z.array(z.string().max(100)).max(50).optional(),platforms:z.array(z.string().max(50)).max(20).optional(),channel:z.string().max(60).optional(),aspect_ratio:z.string().max(30).optional(),dimensions:z.string().max(40).optional(),
  definition:z.record(z.unknown()).optional(),preview:z.record(z.unknown()).optional(),source_kind:z.enum(['owner_upload','first_party','generated']).optional(),approval_status:z.enum(['draft','pending_owner_review','approved','rejected','archived']).optional(),is_brandable:z.boolean().optional(),is_favourite:z.boolean().optional(),
});

router.get('/summary', async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:await library.summary(organizationId(req),req.user!.userId)}); } catch(error){next(error);} });
router.get('/items', async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:await library.listItems(organizationId(req),{
  search:String(req.query.search||'')||undefined,kind:String(req.query.kind||'')||undefined,category:String(req.query.category||'')||undefined,platform:String(req.query.platform||'')||undefined,
  source:String(req.query.source||'')||undefined,approval:String(req.query.approval||'')||undefined,favourite:req.query.favourite===undefined?undefined:req.query.favourite==='true',limit:Number(req.query.limit||100),offset:Number(req.query.offset||0),
})}); } catch(error){next(error);} });
router.get('/items/:id', async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:await library.getItem(organizationId(req),req.params.id)}); } catch(error){next(error);} });
router.post('/items', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.status(201).json({success:true,data:await library.createItem(organizationId(req),req.user!.userId,parse(itemSchema,req.body))}); } catch(error){next(error);} });
router.patch('/items/:id', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:await library.updateItem(organizationId(req),req.params.id,parse(itemSchema.partial(),req.body))}); } catch(error){next(error);} });
router.post('/items/:id/duplicate', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.status(201).json({success:true,data:await library.duplicateItem(organizationId(req),req.params.id,req.user!.userId)}); } catch(error){next(error);} });
router.delete('/items/:id', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { await library.archiveItem(organizationId(req),req.params.id); res.json({success:true,data:{archived:true}}); } catch(error){next(error);} });

router.get('/packs', async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:await library.listPacks(organizationId(req))}); } catch(error){next(error);} });
router.post('/packs', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { const data=parse(z.object({slug:z.string().optional(),name:z.string().min(1),description:z.string().optional(),status:z.enum(['draft','active']).optional(),metadata:z.record(z.unknown()).optional()}),req.body); res.status(201).json({success:true,data:await library.createPack(organizationId(req),req.user!.userId,data)}); } catch(error){next(error);} });
router.post('/packs/:id/items', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try {
  const item = parse(itemSchema,req.body);
  const data = {itemKey:item.item_key||`tenant:${Date.now()}`,kind:item.kind as any,category:item.category,name:item.name,description:item.description||'',tags:item.tags||[],platforms:item.platforms||[],channel:item.channel,aspectRatio:item.aspect_ratio,dimensions:item.dimensions,definition:item.definition||{}};
  res.status(201).json({success:true,data:await library.addPackItem(organizationId(req),req.params.id,data)});
} catch(error){next(error);} });
router.post('/packs/:id/install', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:await library.installPack(organizationId(req),req.params.id,req.user!.userId)}); } catch(error){next(error);} });
router.post('/packs/:id/uninstall', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { await library.uninstallPack(organizationId(req),req.params.id); res.json({success:true,data:{uninstalled:true}}); } catch(error){next(error);} });
router.get('/packs/:id/export', async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:await library.exportPack(organizationId(req),req.params.id)}); } catch(error){next(error);} });
router.post('/packs/:id/duplicate', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.status(201).json({success:true,data:await library.duplicatePack(organizationId(req),req.user!.userId,req.params.id)}); } catch(error){next(error);} });
router.patch('/packs/:id/status', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { const {status}=parse(z.object({status:z.enum(['draft','active','inactive','archived'])}),req.body); res.json({success:true,data:await library.setPackStatus(organizationId(req),req.params.id,status)}); } catch(error){next(error);} });
router.post('/packs/import', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.status(201).json({success:true,data:await library.importPack(organizationId(req),req.user!.userId,req.body)}); } catch(error){next(error);} });
router.post('/import/legacy', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:{imported:await library.importLegacyContentTemplates(organizationId(req),req.user!.userId)}}); } catch(error){next(error);} });

router.get('/stock/providers', (_req,res)=>res.json({success:true,data:getStockProviderStates()}));
router.get('/stock/search', async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { const input=parse(z.object({query:z.string().min(2).max(160),media_type:z.enum(['photo','video']).optional(),orientation:z.enum(['square','landscape','portrait']).optional(),providers:z.string().optional()}),req.query); res.json({success:true,data:await searchStock({query:input.query,mediaType:input.media_type,orientation:input.orientation,providers:input.providers?.split(',') as any})}); } catch(error){next(error);} });
router.post('/stock/save', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { const {save_token}=parse(z.object({save_token:z.string().min(10)}),req.body); res.status(201).json({success:true,data:await saveStockReference(organizationId(req),req.user!.userId,verifyStockSaveToken(save_token))}); } catch(error){next(error);} });

router.post('/bootstrap', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { const input=parse(z.object({website_url:z.string().url(),owner_overrides:z.record(z.unknown()).optional()}),req.body); res.status(202).json({success:true,data:await startBrandBootstrap(organizationId(req),req.user!.userId,input.website_url,input.owner_overrides)}); } catch(error){next(error);} });
router.get('/bootstrap/:id', async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:await getBrandBootstrap(organizationId(req),req.params.id)}); } catch(error){next(error);} });
router.post('/bootstrap/:id/accept', owners, async (req:AuthRequest,res:Response<ApiResponse>,next:NextFunction)=>{ try { res.json({success:true,data:await acceptBrandBootstrap(organizationId(req),req.user!.userId,req.params.id)}); } catch(error){next(error);} });

export default router;
