/** 這個檔案 定義 subgraph 如何map 以及如何儲存 所有event的information  
 * 
 *  自定義規則:
 *  1. 在schema.graphql定義三個table,分別是ItemListed,ItemBought,ItemCanceled,當有event觸發時,會記錄到對應的table中,前端會撈取table來呈現不同的畫面
 *  2. 新增一個table,ActiveItem,用來區別是否已經存在架上
 *
 * 
 *  流程:
 *  當NFT上架到NFT-marketplace時 > 觸發ItemListed事件 > handleItemListed function觸發 > 將event資訊記錄在ActiveItem,ItemListed這兩個table中
 *  table紀錄資訊: NFT賣家,NFT地址,tokenId,販賣價格,買家地址(設為0x000...00)
 * 
 *  
 *  當架上NFT被購買時 > 觸發ItemBought事件 > handleItemBought function觸發 > 讀取itemBought,activeItem Table > 將event資訊寫到itemBought table中
 *  table紀錄資訊: NFT買家,NFT地址,tokenId   修改table資訊: ActiveItem table的買家欄位,修改成買家地址 (並沒有把ActiveItem table刪除)
 * 
 * 
 *  當架上NFT被擁有者下架時 > 觸發ItemCanceled事件 > handleItemCanceled function觸發 > 讀取ItemCanceled,ActiveItem Table > 將event資訊寫到itemCancel
 *  table中 table紀錄資訊: NFT賣家,NFT地址,tokenId  修改table資訊: ActiveItem table的買家欄位,修改成dead Address
*/



//由於BigInt,Address都是特別的類型,因此從graph-ts中import,因為並不像string,int,這種內建在typeScript中的
import { BigInt,Address } from "@graphprotocol/graph-ts";

//這行代表import了三個event類型(ethereum.Event),ItemBought,ItemCanceled,ItemListed
//這三個是自定義的類型(event)不同於一般的string,int,這種一般的類型,是從generated而來
import {
  ItemBought as ItemBoughtEvent,
  ItemCanceled as ItemCanceledEvent,
  ItemListed as ItemListedEvent
} from "../generated/NftMarketplace/NftMarketplace"

// import四個event"物件",這個event物件也是一個自定義類型(Entity),不同於一般的string,int,這種一般的類型,是從generated而來
// 這四個"物件" 就是table中的"條目"
import {ItemListed,ActiveItem,ItemBought,ItemCanceled} from "../generated/schema"


//此function 在ItemListedEvent觸發時呼叫
export function handleItemListed(event: ItemListedEvent): void {
  //讀取ItemListed table,中特定id的條目,這個id會關聯到其他欄位
  let itemListed = ItemListed.load(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))
  //讀取ActiveItem table,中特定id的條目,如果ItemListedEvent觸發時,activeItem已經存在,則一樣讀取,這會發生在更新價格的情況
  let activeItem = ActiveItem.load(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))
  //如果itemListed特定條目不存在,則建立一個新的,如果是新上架的NFT,之前就不會有這筆紀錄,所以創建新的條目entities
  if(!itemListed) {
    itemListed = new ItemListed(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))
  }
  //如果條目不存在則,建立一個activeItem條目
  if(!activeItem) {
    activeItem = new ActiveItem(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))
  }

  //對讀取進來的條目,的欄位填上值
  itemListed.seller = event.params.seller
  activeItem.seller = event.params.seller

  itemListed.nftAddress = event.params.nftAddress
  activeItem.nftAddress = event.params.nftAddress

  itemListed.tokenId = event.params.tokenId
  activeItem.tokenId = event.params.tokenId

  itemListed.price = event.params.price
  activeItem.price = event.params.price

  //將activeItem條目的buyer填入地址,地址是包含0x的42個字母,全為0代表空地址,將activeItem.buyer寫入此地址,代表NFT在架上,尚未有人購買
  activeItem.buyer = Address.fromString("0x0000000000000000000000000000000000000000")

  itemListed.save()
  activeItem.save()
}



//這個function會在ItemBoughtEvent觸發時被呼叫,傳進參數為event:類型是自定義event(ItemBoughtEvent)
//void用於function的回傳值定義，代表這個function不會回傳任何值
export function handleItemBought(event: ItemBoughtEvent): void {
  //ItemBoughtEvent: 只是單純的event,是一個類型
  //ItemBoughtObject: 用來儲存event類型的物件(在schema.graphql中定義的table)

  //itemBought這個物件,讀取id(因為這個自定義類型class需要constructor),這個id來自於輸入參數event,的indexed
  let itemBought = ItemBought.load(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))
  let activeItem = ActiveItem.load(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))

  if (!itemBought) {
    itemBought = new ItemBought(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))
  }

  //itemBought的buyer欄位 = 輸入參數event的buyer index
  itemBought.buyer = event.params.buyer
  itemBought.nftAddress = event.params.nftAddress
  itemBought.tokenId = event.params.tokenId
  
  //我們的 activeItem 將來自 ItemListed ItemListed 應該給activeItem所有的參數 除了buyer之外 
  //所以我們只需要在activeItem 上更新buyer就可以了 
  //變數後面的驚嘆號,代表此變數不會是null或是undefine, 代表如果有buyer即該NFT被買走了,若沒有buyer則NFT還會在架上 
  activeItem!.buyer = event.params.buyer

  itemBought.save()
  activeItem!.save()
}


//當ItemCanceledEvent事件觸發就呼叫此function
export function handleItemCanceled(event: ItemCanceledEvent): void {
  let itemCanceled = ItemCanceled.load(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))
  let activeItem = ActiveItem.load(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))
  if (!itemCanceled) {
    itemCanceled = new ItemCanceled(getIdFromEventParams(event.params.tokenId,event.params.nftAddress))
  }

  itemCanceled.seller = event.params.seller
  itemCanceled.nftAddress = event.params.nftAddress
  itemCanceled.tokenId = event.params.tokenId
  //0x後面36個0+dEaD,地址的長度為0x後面40個字,共42個字 dead address很常用於在燃燒代幣,沒有人擁有它
  activeItem!.buyer = Address.fromString("0x000000000000000000000000000000000000dEaD")

  itemCanceled.save()
  activeItem!.save()
}



//這個function的用意是,從輸入參數進來的兩個值,轉換成16進制後相加,得到一個唯一值,這個唯一值會用在每一個event上,作為ID
//typeScript的語法是  function(輸入參數1:類型 ,輸入參數2:類型):function回傳類型 {}
//                         tokenId類型:BigInt,  nftAddress類型:地址, function回傳類型:字串
function getIdFromEventParams(tokenId: BigInt, nftAddress: Address): string {
  //兩者轉成16進制後相加,最後return(字串類型),因此typeScript不用特別寫型態轉換
  return tokenId.toHexString() + nftAddress.toHexString()
}